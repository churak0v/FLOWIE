function smsRuConfig() {
  const apiId = String(process.env.SMS_RU_API_ID || '').trim();
  const enabled = process.env.SMS_AUTH_ENABLED === 'true' && Boolean(apiId);
  return {
    enabled,
    apiId,
    sender: String(process.env.SMS_RU_SENDER || '').trim(),
    baseUrl: String(process.env.SMS_RU_BASE_URL || 'https://sms.ru').replace(/\/$/, ''),
  };
}

async function sendOtpSms({ phone, code, ip, fetchImpl = fetch }) {
  const config = smsRuConfig();
  if (!config.enabled) {
    const error = new Error('SMS_AUTH_DISABLED');
    error.statusCode = 503;
    throw error;
  }

  const body = new URLSearchParams({
    api_id: config.apiId,
    to: String(phone).replace(/^\+/, ''),
    msg: `Код входа FLOWIE: ${code}. Никому его не сообщайте.`,
    json: '1',
    ttl: '5',
  });
  if (config.sender) body.set('from', config.sender);
  if (ip) body.set('ip', String(ip));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(`${config.baseUrl}/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    const recipient = data?.sms?.[String(phone).replace(/^\+/, '')];
    if (!response.ok || Number(data?.status_code) !== 100 || Number(recipient?.status_code) !== 100) {
      const error = new Error('SMS_PROVIDER_REJECTED');
      error.statusCode = 502;
      error.providerCode = recipient?.status_code || data?.status_code || null;
      throw error;
    }
    return { messageId: recipient.sms_id ? String(recipient.sms_id) : null };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('SMS_PROVIDER_TIMEOUT');
      timeout.statusCode = 504;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { smsRuConfig, sendOtpSms };
