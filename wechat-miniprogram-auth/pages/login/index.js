const api=require('../../utils/api');
Page({
 data:{phone:'',password:''},
 onPhone(e){this.setData({phone:e.detail.value.replace(/\\D/g,'').slice(0,11)})},
 onPassword(e){this.setData({password:e.detail.value})},
 async login(){
  if(!/^1[3-9]\\d{9}$/.test(this.data.phone))return wx.showToast({title:'请输入正确的手机号',icon:'none'});
  if(!this.data.password)return wx.showToast({title:'请输入密码',icon:'none'});
  wx.showLoading({title:'正在登录'});
  try{const result=await api.request('/api/mini-auth/login','POST',{phone:'+86'+this.data.phone,password:this.data.password});api.saveSession(result);wx.switchTab({url:'/pages/home/index'})}
  catch(e){wx.showToast({title:e.message,icon:'none',duration:2600})}
  finally{wx.hideLoading()}
 },
 toRegister(){wx.redirectTo({url:'/pages/register/index'})},
 forgot(){wx.navigateTo({url:'/pages/reset-password/index'})}
});