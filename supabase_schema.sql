-- ============================================================
-- FINTECH APP - SCHEMA COMPLETO PARA SUPABASE
-- Ejecutar en Supabase SQL Editor (en orden)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: profiles (usuarios del sistema)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'commerce')),
  commerce_id UUID,  -- FK se agrega después
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: commerces (puntos aliados / comercios)
-- ============================================================
CREATE TABLE IF NOT EXISTS commerces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  responsible_name TEXT NOT NULL,
  responsible_phone TEXT,
  responsible_email TEXT,
  nit TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked')),
  balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  daily_limit NUMERIC(18,2) DEFAULT 5000000.00,
  alert_threshold NUMERIC(18,2) DEFAULT 1000000.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Agregar FK de profiles a commerces
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_commerce
  FOREIGN KEY (commerce_id) REFERENCES commerces(id) ON DELETE SET NULL;

-- ============================================================
-- TABLA: transactions (todas las operaciones financieras)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_code TEXT UNIQUE NOT NULL DEFAULT 'TXN-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 10)),
  type TEXT NOT NULL CHECK (type IN ('recaudo', 'retiro', 'transferencia', 'ajuste', 'reverso')),
  commerce_id UUID NOT NULL REFERENCES commerces(id),
  dest_commerce_id UUID REFERENCES commerces(id), -- Para transferencias
  client_document TEXT NOT NULL,
  client_name TEXT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(18,2) DEFAULT 0.00,
  net_amount NUMERIC(18,2),
  concept TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reversed')),
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  balance_before NUMERIC(18,2),
  balance_after NUMERIC(18,2),
  performed_by UUID NOT NULL REFERENCES profiles(id),
  reversed_by UUID REFERENCES profiles(id),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: wallet_ledger (libro contable / auditoría de saldos)
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commerce_id UUID NOT NULL REFERENCES commerces(id),
  transaction_id UUID REFERENCES transactions(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit')),
  amount NUMERIC(18,2) NOT NULL,
  balance_before NUMERIC(18,2) NOT NULL,
  balance_after NUMERIC(18,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- ============================================================
-- TABLA: company_account (cuenta concentradora empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_account (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  total_collected NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  total_withdrawn NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  total_fees NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  last_reconciliation TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar registro único de cuenta concentradora
INSERT INTO company_account (id) VALUES ('00000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLA: audit_log (log de auditoría)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: fraud_alerts (alertas antifraude)
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commerce_id UUID REFERENCES commerces(id),
  transaction_id UUID REFERENCES transactions(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('high_amount', 'unusual_frequency', 'suspicious_pattern', 'manual')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: daily_reconciliation (conciliación diaria)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reconciliation_date DATE NOT NULL UNIQUE,
  total_recaudo NUMERIC(18,2) DEFAULT 0,
  total_retiro NUMERIC(18,2) DEFAULT 0,
  total_transferencia NUMERIC(18,2) DEFAULT 0,
  total_fees NUMERIC(18,2) DEFAULT 0,
  transaction_count INT DEFAULT 0,
  active_commerces INT DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reconciled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id)
);

-- ============================================================
-- ÍNDICES para rendimiento
-- ============================================================
CREATE INDEX idx_transactions_commerce ON transactions(commerce_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_client ON transactions(client_document);
CREATE INDEX idx_ledger_commerce ON wallet_ledger(commerce_id);
CREATE INDEX idx_ledger_created ON wallet_ledger(created_at DESC);
CREATE INDEX idx_fraud_alerts_commerce ON fraud_alerts(commerce_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================
-- FUNCIÓN: generar código de transacción único
-- ============================================================
CREATE OR REPLACE FUNCTION generate_transaction_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_count INT;
BEGIN
  LOOP
    code := 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || NOW()::TEXT), 1, 8));
    SELECT COUNT(*) INTO exists_count FROM transactions WHERE transaction_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: ejecutar transacción con control de saldo (ATÓMICA)
-- ============================================================
CREATE OR REPLACE FUNCTION execute_transaction(
  p_type TEXT,
  p_commerce_id UUID,
  p_dest_commerce_id UUID,
  p_client_document TEXT,
  p_client_name TEXT,
  p_amount NUMERIC,
  p_concept TEXT,
  p_fee NUMERIC,
  p_performed_by UUID,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_commerce RECORD;
  v_dest_commerce RECORD;
  v_transaction_id UUID;
  v_code TEXT;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_net_amount NUMERIC;
  v_requires_confirmation BOOLEAN := FALSE;
  v_is_flagged BOOLEAN := FALSE;
  v_flag_reason TEXT;
BEGIN
  -- Bloquear registro del comercio para evitar race conditions
  SELECT * INTO v_commerce FROM commerces WHERE id = p_commerce_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comercio no encontrado');
  END IF;
  
  IF v_commerce.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comercio suspendido o bloqueado');
  END IF;

  v_balance_before := v_commerce.balance;
  v_net_amount := p_amount - COALESCE(p_fee, 0);

  -- Verificar si requiere confirmación (monto alto)
  IF p_amount >= v_commerce.alert_threshold THEN
    v_requires_confirmation := TRUE;
    v_is_flagged := TRUE;
    v_flag_reason := 'Monto superior al umbral de alerta: $' || p_amount;
  END IF;

  -- Calcular nuevo saldo según tipo
  IF p_type = 'recaudo' THEN
    v_balance_after := v_balance_before + p_amount;
  ELSIF p_type IN ('retiro', 'transferencia') THEN
    IF v_balance_before < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente. Saldo actual: $' || v_balance_before);
    END IF;
    v_balance_after := v_balance_before - p_amount;
  ELSIF p_type = 'ajuste' THEN
    v_balance_after := v_balance_before + p_amount; -- ajuste positivo o negativo
  ELSE
    v_balance_after := v_balance_before;
  END IF;

  -- Generar código único
  v_code := generate_transaction_code();
  v_transaction_id := uuid_generate_v4();

  -- Insertar transacción
  INSERT INTO transactions (
    id, transaction_code, type, commerce_id, dest_commerce_id,
    client_document, client_name, amount, fee, net_amount,
    concept, status, requires_confirmation, balance_before, balance_after,
    performed_by, ip_address, is_flagged, flag_reason
  ) VALUES (
    v_transaction_id, v_code, p_type, p_commerce_id, p_dest_commerce_id,
    p_client_document, p_client_name, p_amount, COALESCE(p_fee, 0), v_net_amount,
    p_concept, 'approved', v_requires_confirmation, v_balance_before, v_balance_after,
    p_performed_by, p_ip_address, v_is_flagged, v_flag_reason
  );

  -- Actualizar saldo del comercio
  UPDATE commerces SET balance = v_balance_after, updated_at = NOW()
  WHERE id = p_commerce_id;

  -- Registrar en libro contable
  INSERT INTO wallet_ledger (commerce_id, transaction_id, entry_type, amount, balance_before, balance_after, description, created_by)
  VALUES (
    p_commerce_id, v_transaction_id,
    CASE WHEN p_type = 'recaudo' THEN 'credit' ELSE 'debit' END,
    p_amount, v_balance_before, v_balance_after,
    p_type || ': ' || COALESCE(p_concept, 'Sin concepto'),
    p_performed_by
  );

  -- Si es transferencia, afectar comercio destino
  IF p_type = 'transferencia' AND p_dest_commerce_id IS NOT NULL THEN
    SELECT * INTO v_dest_commerce FROM commerces WHERE id = p_dest_commerce_id FOR UPDATE;
    
    UPDATE commerces SET balance = v_dest_commerce.balance + p_amount, updated_at = NOW()
    WHERE id = p_dest_commerce_id;

    INSERT INTO wallet_ledger (commerce_id, transaction_id, entry_type, amount, balance_before, balance_after, description, created_by)
    VALUES (
      p_dest_commerce_id, v_transaction_id, 'credit',
      p_amount, v_dest_commerce.balance, v_dest_commerce.balance + p_amount,
      'Transferencia recibida de: ' || v_commerce.name,
      p_performed_by
    );
  END IF;

  -- Actualizar cuenta concentradora
  UPDATE company_account SET
    total_balance = total_balance + CASE WHEN p_type = 'recaudo' THEN p_amount WHEN p_type = 'retiro' THEN -p_amount ELSE 0 END,
    total_collected = total_collected + CASE WHEN p_type = 'recaudo' THEN p_amount ELSE 0 END,
    total_withdrawn = total_withdrawn + CASE WHEN p_type = 'retiro' THEN p_amount ELSE 0 END,
    total_fees = total_fees + COALESCE(p_fee, 0),
    updated_at = NOW()
  WHERE id = '00000000-0000-0000-0000-000000000001';

  -- Crear alerta si es necesario
  IF v_is_flagged THEN
    INSERT INTO fraud_alerts (commerce_id, transaction_id, alert_type, severity, description)
    VALUES (
      p_commerce_id, v_transaction_id, 'high_amount',
      CASE WHEN p_amount >= v_commerce.alert_threshold * 5 THEN 'critical'
           WHEN p_amount >= v_commerce.alert_threshold * 2 THEN 'high'
           ELSE 'medium' END,
      v_flag_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'transaction_code', v_code,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'requires_confirmation', v_requires_confirmation,
    'is_flagged', v_is_flagged
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: revertir transacción
-- ============================================================
CREATE OR REPLACE FUNCTION reverse_transaction(
  p_transaction_id UUID,
  p_reversed_by UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_txn RECORD;
  v_commerce RECORD;
BEGIN
  SELECT * INTO v_txn FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transacción no encontrada');
  END IF;
  
  IF v_txn.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden revertir transacciones aprobadas');
  END IF;

  SELECT * INTO v_commerce FROM commerces WHERE id = v_txn.commerce_id FOR UPDATE;

  -- Revertir el efecto en el saldo
  IF v_txn.type = 'recaudo' THEN
    IF v_commerce.balance < v_txn.amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente para revertir');
    END IF;
    UPDATE commerces SET balance = balance - v_txn.amount WHERE id = v_txn.commerce_id;
  ELSIF v_txn.type IN ('retiro', 'transferencia') THEN
    UPDATE commerces SET balance = balance + v_txn.amount WHERE id = v_txn.commerce_id;
  END IF;

  -- Marcar transacción como revertida
  UPDATE transactions SET
    status = 'reversed',
    reversed_by = p_reversed_by,
    reversed_at = NOW(),
    reversal_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- Insertar en libro contable la reversión
  INSERT INTO wallet_ledger (commerce_id, transaction_id, entry_type, amount, balance_before, balance_after, description, created_by)
  SELECT
    v_txn.commerce_id, p_transaction_id,
    CASE WHEN v_txn.type = 'recaudo' THEN 'debit' ELSE 'credit' END,
    v_txn.amount,
    v_commerce.balance,
    CASE WHEN v_txn.type = 'recaudo' THEN v_commerce.balance - v_txn.amount ELSE v_commerce.balance + v_txn.amount END,
    'REVERSO de ' || v_txn.transaction_code || ': ' || p_reason,
    p_reversed_by;

  -- Log de auditoría
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
  VALUES (p_reversed_by, 'REVERSE_TRANSACTION', 'transactions', p_transaction_id::TEXT,
    jsonb_build_object('reason', p_reason, 'reversed_at', NOW()));

  RETURN jsonb_build_object('success', true, 'message', 'Transacción revertida exitosamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerces ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reconciliation ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_commerce_id()
RETURNS UUID AS $$
  SELECT commerce_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Políticas: profiles
CREATE POLICY "profiles_self_read" ON profiles FOR SELECT USING (id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- Políticas: commerces
CREATE POLICY "commerces_admin_all" ON commerces FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "commerces_commerce_read" ON commerces FOR SELECT USING (id = get_user_commerce_id());

-- Políticas: transactions
CREATE POLICY "transactions_admin_all" ON transactions FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "transactions_commerce_own" ON transactions FOR SELECT USING (commerce_id = get_user_commerce_id());
CREATE POLICY "transactions_commerce_insert" ON transactions FOR INSERT WITH CHECK (commerce_id = get_user_commerce_id() OR get_user_role() = 'admin');

-- Políticas: wallet_ledger
CREATE POLICY "ledger_admin_all" ON wallet_ledger FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "ledger_commerce_own" ON wallet_ledger FOR SELECT USING (commerce_id = get_user_commerce_id());

-- Políticas: fraud_alerts
CREATE POLICY "alerts_admin_all" ON fraud_alerts FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "alerts_commerce_own" ON fraud_alerts FOR SELECT USING (commerce_id = get_user_commerce_id());

-- Políticas: company_account
CREATE POLICY "company_admin_only" ON company_account FOR ALL USING (get_user_role() = 'admin');

-- Políticas: audit_log
CREATE POLICY "audit_admin_only" ON audit_log FOR ALL USING (get_user_role() = 'admin');

-- Políticas: daily_reconciliation
CREATE POLICY "reconciliation_admin_only" ON daily_reconciliation FOR ALL USING (get_user_role() = 'admin');

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_commerces BEFORE UPDATE ON commerces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_transactions BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrar usuario
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'commerce')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- VISTAS para reportes
-- ============================================================
CREATE OR REPLACE VIEW v_daily_metrics AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN type = 'recaudo' THEN amount ELSE 0 END) as total_recaudo,
  SUM(CASE WHEN type = 'retiro' THEN amount ELSE 0 END) as total_retiro,
  SUM(CASE WHEN type = 'transferencia' THEN amount ELSE 0 END) as total_transferencia,
  SUM(fee) as total_fees,
  COUNT(CASE WHEN is_flagged THEN 1 END) as flagged_count,
  COUNT(DISTINCT commerce_id) as active_commerces
FROM transactions
WHERE status = 'approved'
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW v_commerce_summary AS
SELECT
  c.id, c.name, c.status, c.balance,
  COUNT(t.id) as total_transactions,
  SUM(CASE WHEN t.type = 'recaudo' AND t.status = 'approved' THEN t.amount ELSE 0 END) as total_recaudo,
  SUM(CASE WHEN t.type = 'retiro' AND t.status = 'approved' THEN t.amount ELSE 0 END) as total_retiro,
  MAX(t.created_at) as last_transaction
FROM commerces c
LEFT JOIN transactions t ON t.commerce_id = c.id
GROUP BY c.id, c.name, c.status, c.balance;

-- ============================================================
-- DATOS INICIALES DE PRUEBA
-- ============================================================
-- NOTA: El primer usuario admin debe crearse manualmente desde
-- Supabase Authentication, luego ejecutar:
-- UPDATE profiles SET role = 'admin' WHERE email = 'tu@email.com';

-- Comercio de prueba (opcional)
INSERT INTO commerces (name, address, city, responsible_name, responsible_phone, nit, balance)
VALUES ('Comercio Demo', 'Calle 1 #2-3', 'Cartagena', 'Juan Pérez', '3001234567', '900123456-1', 5000000.00)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE transactions IS 'Registro de todas las transacciones financieras';
COMMENT ON TABLE wallet_ledger IS 'Libro contable - auditoría de cada movimiento de saldo';
COMMENT ON TABLE company_account IS 'Cuenta concentradora de la empresa - registro global';
COMMENT ON FUNCTION execute_transaction IS 'Función atómica para ejecutar transacciones con control de saldo';
