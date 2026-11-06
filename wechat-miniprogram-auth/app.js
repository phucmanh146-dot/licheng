const api = require('./utils/api');
App({
  globalData: { user: null, apiBase: '' },
  onLaunch() {
    const token = wx.getStorageSync('sy_access_token');
    if (!token) {
      wx.reLaunch({ url: '/pages/register/index' });
      return;
    }
    api.request('/api/mini-auth/me', 'GET').then(res => {
      this.globalData.user = res.user;
      wx.reLaunch({ url: '/pages/home/index' });
    }).catch(() => {
      api.clearSession();
      wx.reLaunch({ url: '/pages/login/index' });
    });
  }
});