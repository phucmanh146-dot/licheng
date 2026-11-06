const api = require('../../utils/api');
const {normalizeCnMobile, isValidCnMobile} = require('../../utils/phone');
Page({
  data:{phone:'',code:'',agreed:false,countdown:0,sending:false},
  timer:null,
  onUnload(){if(this.timer)clearInterval(this.timer)},
  onPhone(e){this.setData({phone:normalizeCnMobile(e.detail.value)})},
  onCode(e){this.setData({code:e.detail.value.replace(/\D/g,'').slice(0,6)})},
  onAgree(e){this.setData({agreed:!!(e.detail.value||[]).length})},
  async sendCode(){
    if(!isValidCnMobile(this.data.phone))return wx.showToast({title:'手机号应为有效的11位大陆手机号',icon:'none'});
    if(this.data.sending||this.data.countdown)return;
    this.setData({sending:true});
    try{
      await api.request('/api/mini-auth/sms/send','POST',{phone:'+86'+this.data.phone,purpose:'register'});
      wx.showToast({title:'短信已发送',icon:'success'});
      this.setData({countdown:60});
      this.timer=setInterval(()=>{const n=this.data.countdown-1;this.setData({countdown:n});if(n<=0){clearInterval(this.timer);this.timer=null}},1000);
    }catch(e){wx.showToast({title:e.message,icon:'none',duration:2600})}
    finally{this.setData({sending:false})}
  },
  async continue(){
    if(!this.data.agreed)return wx.showToast({title:'请先同意用户协议和隐私政策',icon:'none'});
    if(!isValidCnMobile(this.data.phone))return wx.showToast({title:'手机号应为有效的11位大陆手机号',icon:'none'});
    if(!/^\d{6}$/.test(this.data.code))return wx.showToast({title:'请输入6位短信验证码',icon:'none'});
    wx.showLoading({title:'正在验证'});
    try{
      const result=await api.request('/api/mini-auth/sms/verify','POST',{phone:'+86'+this.data.phone,code:this.data.code,purpose:'register'});
      wx.setStorageSync('sy_signup_challenge',{phone:'+86'+this.data.phone,verificationToken:result.verificationToken});
      wx.navigateTo({url:'/pages/set-password/index'});
    }catch(e){wx.showToast({title:e.message,icon:'none',duration:2600})}
    finally{wx.hideLoading()}
  },
  toLogin(){wx.navigateTo({url:'/pages/login/index'})},toLegacy(){wx.navigateTo({url:'/pages/legacy-login/index'})}
});