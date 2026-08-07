// Login admin: credenciales, TOTP, enrolamiento obligatorio y recuperación
// de contraseña con TOTP/código de respaldo.

import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, ApiError } from '../api.js';

const COLOR_RE = /^#[0-9A-Fa-f]{3,8}$/;

function errorMessage(err, fallback) {
  return err instanceof ApiError ? (err.message || fallback) : fallback;
}

export default function Login() {
  const { login, completeFirstTwoFactor, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [passwordToken, setPasswordToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupToken, setSetupToken] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [step, setStep] = useState('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [bg, setBg] = useState('#0F2A47');
  const [bgSecondary, setBgSecondary] = useState('#FF6B35');
  const [bgMode, setBgMode] = useState('solid');
  const [bgImage, setBgImage] = useState(null);
  const [storeName, setStoreName] = useState('TechStore');
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public/site-config');
        const data = await res.json();
        const c = data?.config || {};
        if (typeof c.admin_login_bg === 'string' && COLOR_RE.test(c.admin_login_bg)) setBg(c.admin_login_bg);
        if (typeof c.admin_login_bg_secondary === 'string' && COLOR_RE.test(c.admin_login_bg_secondary)) setBgSecondary(c.admin_login_bg_secondary);
        if (['solid', 'gradient', 'image'].includes(c.admin_login_bg_mode)) setBgMode(c.admin_login_bg_mode);
        if (typeof c.admin_login_bg_image_url === 'string' && c.admin_login_bg_image_url) setBgImage(c.admin_login_bg_image_url);
        if (typeof c.site_name === 'string' && c.site_name.trim()) {
          setStoreName(c.site_name);
          document.title = `${c.site_name} · Admin`;
        }
        if (typeof c.logo_url === 'string' && c.logo_url) setLogoUrl(c.logo_url);
      } catch { /* fallback al tema TechStore */ }
    })();
  }, []);

  useEffect(() => {
    if (!location.state?.sessionExpired) return;
    setNotice('Tu sesión expiró. Inicia sesión nuevamente para continuar.');
    navigate('/login', { replace: true, state: null });
  }, [location.state, navigate]);

  const shellStyle = useMemo(() => {
    if (bgMode === 'image' && bgImage) {
      return {
        backgroundColor: bg,
        backgroundImage: `linear-gradient(135deg, ${bg}dd, ${bgSecondary}aa), url("${bgImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (bgMode === 'gradient') {
      return { background: `linear-gradient(135deg, ${bg} 0%, ${bgSecondary} 100%)` };
    }
    return { background: bg };
  }, [bg, bgMode, bgImage, bgSecondary]);

  if (status === 'auth') {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const goToDashboard = () => navigate(location.state?.from?.pathname || '/', { replace: true });

  const handleCredentials = async (event) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await login(email.trim(), password, step === 'totp' ? totpCode.trim() : undefined);
      goToDashboard();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'two_factor_required') {
        setStep('totp');
        setTotpCode('');
        setError('Ingresa el código de tu aplicación autenticadora.');
      } else if (err instanceof ApiError && err.code === 'two_factor_setup_required') {
        const token = err.details?.data?.setup_token;
        if (!token) {
          setError('No se pudo iniciar la configuración del segundo factor.');
        } else {
          try {
            const setupResponse = await api.firstTwoFactorSetup(token);
            setSetupToken(token);
            setSetupData(setupResponse.data);
            setStep('first_setup');
            setError(null);
          } catch (setupError) {
            setError(errorMessage(setupError, 'No se pudo preparar la configuración del segundo factor.'));
          }
        }
      } else {
        setError(errorMessage(err, 'No se pudo iniciar sesión.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFirstSetup = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await completeFirstTwoFactor(setupToken, setupCode.trim());
      goToDashboard();
    } catch (err) {
      setError(errorMessage(err, 'El código no es válido. Revisa la hora de tu aplicación e intenta de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryEmail = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await api.recoverStart(email.trim());
      setRecoveryToken(response.data.recovery_token);
      setStep('recovery_totp');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'recovery_email_not_available') {
        setError('Esta cuenta todavía no tiene 2FA activo. Configúralo primero desde Usuarios y luego podrás recuperar la contraseña.');
      } else {
        setError(errorMessage(err, 'Ese correo no tiene recuperación 2FA disponible.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryToken = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await api.recoverVerify(recoveryToken, recoveryCode.trim());
      setPasswordToken(response.data.password_token);
      setStep('recovery_password');
      setRecoveryCode('');
    } catch (err) {
      setError(errorMessage(err, 'El código 2FA no es válido.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryPassword = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      setLoading(false);
      return;
    }
    try {
      await api.recoverComplete(passwordToken, newPassword);
      setStep('credentials');
      setPassword('');
      setRecoveryCode('');
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryToken(null);
      setPasswordToken(null);
      setNotice('Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo recuperar la contraseña.'));
    } finally {
      setLoading(false);
    }
  };

  const title = step === 'first_setup' ? 'Activa tu seguridad' : step.startsWith('recovery') ? 'Recupera tu contraseña' : 'Bienvenido de nuevo';
  const description = step === 'first_setup'
    ? 'Configura tu aplicación autenticadora antes de entrar al panel.'
    : step === 'recovery_email'
      ? 'Primero validaremos el correo de tu cuenta.'
      : step === 'recovery_totp'
        ? 'Ahora confirma tu identidad con 2FA.'
        : step === 'recovery_password'
          ? 'Define una contraseña nueva para tu cuenta.'
      : 'Gestiona tu tienda desde un solo lugar.';

  return (
    <div className="login-shell" style={shellStyle}>
      <div className="login-orb login-orb-one" />
      <div className="login-orb login-orb-two" />
      <div className="login-layout">
        <div className="login-pitch">
          <span className="login-eyebrow">Panel privado</span>
          <h2>{storeName}</h2>
          <p>Todo lo que necesitas para administrar tu catálogo y hacer crecer tu tienda.</p>
        </div>
        <form className="login-card" onSubmit={step === 'first_setup' ? handleFirstSetup : step === 'recovery_email' ? handleRecoveryEmail : step === 'recovery_totp' ? handleRecoveryToken : step === 'recovery_password' ? handleRecoveryPassword : handleCredentials}>
          <div className="login-brand">
            {logoUrl
              ? <img className="login-logo" src={logoUrl} alt={`Logo de ${storeName}`} />
              : <span className="login-brand-fallback">{storeName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="login-card-heading">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {notice && <div className="alert alert-success">{notice}</div>}
          {error && <div className={`alert ${step === 'totp' && error === 'Ingresa el código de tu aplicación autenticadora.' ? 'alert-info' : 'alert-error'}`}>{error}</div>}

          {step === 'first_setup' && setupData && (
            <>
              <div className="two-factor-setup">
                <div className="qr-frame"><QRCodeSVG value={setupData.otpauth_uri} size={174} includeMargin /></div>
                <p>Escanea este QR con Google Authenticator, 1Password o la aplicación que uses.</p>
                <label htmlFor="first-setup-code">Código de 6 dígitos</label>
                <input id="first-setup-code" className="input code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus value={setupCode} onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="backup-codes"><strong>Guarda tus códigos de respaldo</strong><span>{setupData.backup_codes.join(' · ')}</span></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Activar y entrar'}</button>
            </>
          )}

          {step === 'recovery_email' && (
            <>
              <div className="form-group"><label htmlFor="recovery-email">Correo</label><input id="recovery-email" className="input" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Siguiente'}</button>
              <button type="button" className="login-link login-link-button" onClick={() => { setStep('credentials'); setError(null); }}>Volver al inicio de sesión</button>
            </>
          )}

          {step === 'recovery_totp' && (
            <>
              <div className="form-group"><label htmlFor="recovery-code">Token 2FA o código de respaldo</label><input id="recovery-code" className="input code-input" required autoFocus autoComplete="one-time-code" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Siguiente'}</button>
              <button type="button" className="login-link login-link-button" onClick={() => { setStep('recovery_email'); setRecoveryToken(null); setRecoveryCode(''); setError(null); }}>Volver al correo</button>
            </>
          )}

          {step === 'recovery_password' && (
            <>
              <div className="form-group"><label htmlFor="recovery-password">Nueva contraseña</label><input id="recovery-password" className="input" type="password" minLength={8} required autoFocus autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              <div className="form-group"><label htmlFor="recovery-password-confirm">Confirma la contraseña</label><input id="recovery-password-confirm" className="input" type="password" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Cambiar contraseña'}</button>
              <button type="button" className="login-link login-link-button" onClick={() => { setStep('recovery_totp'); setPasswordToken(null); setNewPassword(''); setConfirmPassword(''); setError(null); }}>Volver al token</button>
            </>
          )}

          {(step === 'credentials' || step === 'totp') && (
            <>
              <div className="form-group"><label htmlFor="email">Correo</label><input id="email" className="input" type="email" required autoComplete="username" autoFocus={step === 'credentials'} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="form-group"><label htmlFor="password">Contraseña</label><input id="password" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              {step === 'totp' && <div className="form-group"><label htmlFor="totp">Código de autenticación</label><input id="totp" className="input code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" autoFocus value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} /></div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : step === 'totp' ? 'Verificar e ingresar' : 'Iniciar sesión'}</button>
              <div className="login-actions"><button type="button" className="login-link login-link-button" onClick={() => { setStep('recovery_email'); setRecoveryToken(null); setPasswordToken(null); setError(null); setNotice(null); }}>¿Olvidaste tu contraseña?</button>{step === 'totp' && <button type="button" className="login-link login-link-button" onClick={() => { setStep('credentials'); setTotpCode(''); setError(null); }}>Cambiar cuenta</button>}</div>
            </>
          )}
          <div className="login-footer">Acceso protegido · TechStore</div>
        </form>
      </div>
    </div>
  );
}
