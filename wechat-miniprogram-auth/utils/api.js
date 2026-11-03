const API_BASE = 'https://shanganya-v8-workbench-production.up.railway.app';
function request(path, method='POST', data={}) {
  const token = wx.getStorageSync('sy_access_token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method,
      data,
      timeout: 15000,
      header: Object.assign({'content-type':'application/json'}, token ? {Authorization:'Bearer '+token} : {}),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data || {});
        else reject(new Error((res.data && res.data.error) || '请求失败，请稍后重试。'));
      },
      fail() { reject(new Error('网络连接失败，请检查网络后重试。')); }
    });
  });
}
function saveSession(data) {
  if (!data || !data.token) throw new Error('服务端没有返回有效登录凭证。');
  wx.setStorageSync('sy_access_token', data.token);
  wx.setStorageSync('sy_user', data.user || null);
}
function clearSession() {
  wx.removeStorageSync('sy_access_token');
  wx.removeStorageSync('sy_user');
}
function maskPhone(phone) {
  const p = String(phone || '');
  if (p.startsWith('+86') && p.length >= 14) return '+86 ' + p.slice(3, 6) + ' **** ' + p.slice(-4);
  if (p.length > 7) return p.slice(0, 3) + ' **** ' + p.slice(-4);
  return p;
}
module.exports = {request, saveSession, clearSession, maskPhone};