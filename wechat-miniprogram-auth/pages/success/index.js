const api=require('../../utils/api');
Page({
 data:{phone:''},
 onShow(){const u=wx.getStorageSync('sy_user')||{};this.setData({phone:api.maskPhone(u.phone||'')})},
 enter(){wx.switchTab({url:'/pages/home/index'})}
});