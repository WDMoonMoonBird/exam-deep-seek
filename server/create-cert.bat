@echo off
echo 正在生成自签证书...
node -e "const {generateKeyPairSync,createSign}=require('crypto');const{x509}=require('@peculiar/x509');const k=generateKeyPairSync('rsa',{modulusLength:2048});const c=new x509.X509Certificate('CN=localhost');c.publicKey=k.publicKey;c.signingKey=k.privateKey;c.serialNumber='01';c.notBefore=new Date();c.notAfter=new Date(Date.now()+365*864e5);require('fs').writeFileSync('ssl.crt',c.toString());require('fs').writeFileSync('ssl.key',k.privateKey.export({type:'pkcs1',format:'pem'}));console.log('证书已生成: ssl.crt / ssl.key')"
echo 完成
pause
