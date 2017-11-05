var nodemailer = require('nodemailer');
module.exports = EMailHelper;

function EMailHelper () {
  var transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    requireTLS: false,
    auth: {
      user: process.env.SMTP_AUTH_USER,
      pass: process.env.SMTP_AUTH_PWD
    }
  });
  
  return new EMail(transporter);
};

function EMail(transporter) {
  this.transporter = transporter;
  this.sendBotMail = function sendBotMail(subject, body, TO) {
    var mailOptions = {
        from: process.env.SMTP_FROM_USER,
        to: TO,
        bcc: process.env.SMTP_CC_USER,
        subject: subject,
        text: body
    };
    
    this.transporter.sendMail(mailOptions, function(error, info){
    if (error) {
        console.log(error);
    } else {
        console.log('Email sent: ' + info.response);
    }
    });
    
}


    
}