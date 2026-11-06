const api=require('../../utils/api');
Page({
 data:{phone:'',code:'',password:'',confirm:'',countdown:0,sending:false,verified:false,verificationToken:''},
 timer:null,onUnload(){if(this.timer)clearInterval(this.timer)},
 onPhone(e){this.setData({phone:e.detail.value.replace(/\D/g,'').slice(0,11)})},
 onCode(e){this.setData({code:e.detail.value.replace(/\D/g,'').slice(0,6)})},
 onPassword(e){this.setData({password:e.detail.value})},onConfirm(e){this.setData({confirm:e.detail.value})},
 async sendCode(){if(!/^1[3-9]\d{9}$/.test(this.data.phone))return wx.showToast({title:'请输入正确手机号',icon:'none'});if(this.data.countdown||this.data.sending)return;this.setData({sending:true});try{await api.request('/api/mini-auth/sms/send','POST',{phone:'+86'+this.data.phone,purpose:'reset'});this.setData({countdown:60});this.timer=setInterval(()=>{const n=this.data.countdown-1;this.setData({countdown:n});if(n<=0){clearInterval(this.timer);this.timer=null}},1000)}catch(e){wx.showToast({title:e.message,icon:'none'})}finally{this.setData({sending:false})}},
 async verify(){try{const r=await api.request('/api/mini-auth/sms/verify','POST',{phone:'+86'+this.data.phone,code:this.data.code,purpose:'reset'});this.setData({verified:true,verificationToken:r.verificationToken});wx.showToast({title:'手机号验证成功',icon:'success'})}catch(e){wx.showToast({title:e.message,icon:'none'})}},
 async save(){const p=this.data.password;if(!this.data.verified)return wx.showToast({title:'请先验证短信验证码',icon:'none'});if(p.length<8||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))return wx.showToast({title:'密码至少8位，包含字母和数字',icon:'none'});if(p!==this.data.confirm)return wx.showToast({title:'两次密码不一致',icon:'none'});try{await api.request('/api/mini-auth/password/reset','POST',{phone:'+86'+this.data.phone,verificationToken:this.data.verificationToken,password:p});wx.showToast({title:'密码重置成功，请登录',icon:'success'});setTimeout(()=>wx.redirectTo({url:'/pages/login/index'}),700)}catch(e){wx.showToast({title:e.message,icon:'none'})}}
});