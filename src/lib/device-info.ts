/**
 * Fetch the client's public IP address (best-effort, non-blocking).
 */
export const getClientIp = async (): Promise<string | null> => {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch {
    console.warn('IP address lookup failed');
    return null;
  }
};

/**
 * Resolve IP to city/country via ip-api.com (best-effort, non-blocking).
 */
export const resolveIpGeolocation = async (ip: string): Promise<{ city: string | null; country: string | null }> => {
  if (!ip) return { city: null, country: null };
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { city: null, country: null };
    const data = await res.json();
    if (data.status === 'success') {
      return { city: data.city || null, country: data.country || null };
    }
    return { city: null, country: null };
  } catch {
    console.warn('IP geolocation lookup failed');
    return { city: null, country: null };
  }
};

/**
 * Collect client-side device info for audit logging, including IP + geolocation.
 */
export const collectDeviceInfo = () => {
  const ua = navigator.userAgent;
  
  let deviceType = 'Desktop';
  if (/Mobi|Android/i.test(ua)) deviceType = 'Mobile';
  else if (/Tablet|iPad/i.test(ua)) deviceType = 'Tablet';

  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return {
    user_agent_raw: ua,
    device_type: deviceType,
    browser,
    os,
  };
};
