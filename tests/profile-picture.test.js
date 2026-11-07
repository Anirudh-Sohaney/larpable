const assert=require('node:assert/strict');
const sharp=require('sharp');
const pictures=require('../backend/profile_picture');
(async()=>{
  for(const format of ['png','jpeg','webp','gif','avif']){
    const bytes=await sharp({create:{width:600,height:300,channels:3,background:'#fe8642'}}).toFormat(format).toBuffer();
    const saved=await pictures.normalize(`data:image/${format};base64,${bytes.toString('base64')}`);
    const info=await sharp(Buffer.from(saved,'base64')).metadata();
    assert.equal(info.width,256);assert.equal(info.height,256);assert.equal(info.format,'webp');
  }
  assert.equal(await pictures.normalize(null),null);
  for(const input of ['data:image/svg+xml;base64,PHN2Zz4=',{},'data:image/png;base64,AAAA'])await assert.rejects(pictures.normalize(input),{status:400});
  assert.equal(pictures.fallback('alice'),pictures.fallback('alice'));
  assert.match(pictures.fallback('alice'),/>A<\/text>/);
  assert.ok(!pictures.fallback('<script>').includes('<script>'));
  console.log('Profile picture formats, normalization, validation and generated avatars passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
