const api=require('../../utils/api');
Page({
 data:{password:'',confirm:'',challenge:null},
 onLoad(){const challenge=wx.getStorageSync('sy_signup_challenge');if(!challenge||!challenge.verificationToken){wx.redirectTo({url:'/pages/register/index'});return}this.setData({challenge})},
 onPassword(e){this.setData({password:e.detail.value})},
 onConfirm(e){this.setData({confirm:e.detail.value})},
 async create(){
  const p=this.data.password;
  if(p.length<8||p.length>128||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))return wx.showToast({title:'密码至少8位，且包含字母和数字',icon:'none'});
  if(p!==this.data.confirm)return wx.showToast({title:'两次输入的密码不一致',icon:'none'});
  wx.showLoading({title:'正在创建账号'});
  try{
   const result=await api.request('/api/mini-auth/register','POST',{phone:this.data.challenge.phone,verificationToken:this.data.challenge.verificationToken,password:p});
   api.saveSession(result);wx.removeStorageSync('sy_signup_challenge');
   wx.redirectTo({url:'/pages/success/index'});
  }catch(e){wx.showToast({title:e.message,icon:'none',duration:2600})}
  finally{wx.hideLoading()}
 },
 back(){wx.navigateBack()}
});