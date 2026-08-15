// 生成带网站 logo 的二维码 SVG
import qrcode from 'qrcode';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 书页 logo path（1024x1024 viewBox）
const logoPaths = `
    <path d="M821.5 981h-452C258.1 981 167 889.9 167 778.5v-284C167 383.1 258.1 292 369.5 292h452c111.4 0 202.5 91.1 202.5 202.5v284c0 111.4-91.1 202.5-202.5 202.5z" fill="#B9ADF6"/>
    <path d="M784 928.4H241c-105.1 0-191-85.9-191-191V286.6c0-105 85.9-191 191-191h543c105 0 191 86 191 191V737.4c0 105.1-85.9 191-191 191z" fill="#2C45E5"/>
    <path d="M241 928.4c-105.1 0-191-85.9-191-191V286.6c0-105 85.9-191 191-191h543c105 0 191 86 191 191C934.1 711 655.2 889.5 241 928.4z" fill="#475AEC"/>
    <path d="M50 708.4V286.6c0-105 85.9-191 191-191h472C782 456 477 733 50 708.4z" fill="#747DF8"/>
    <path d="M50 466.5V286.6c0-105 85.9-191 191-191h204.5C454.4 421.7 351 438 50 466.5z" fill="#8F92FE"/>
    <path d="M641.9 304.2c-75.7 0-114.7 21.2-133.1 36-19.4-15.9-57.4-36-135.1-36-99.4-0.2-151.5 36.5-151.5 50.8v366.5c0 13.8 11.2 25.4 24.6 25.4 0 0 58.3-12.7 121.9-12.7 64.5 0 134.2 12.7 134.2 12.7 2 0 4.1 0 6.1-1.1 2 0 4.1 1.1 6.1 1.1 0 0 58.3-12.7 121.9-12.7 64.3 0.1 134 12.8 134 12.8 13.3 0 24.6-11.6 24.6-25.4V355.1c-0.1-18.5-67.9-54.2-153.7-50.9z m-169 291.4c0 7.4-8.2 12.7-18.4 12.7H292.7c-10.3 0-18.4-5.3-18.4-12.7v-12.7c0-7.4 8.2-12.7 18.4-12.7h161.7c10.3 0 18.4 5.3 18.4 12.7v12.7z m0-114.5c0 7.4-8.2 12.7-18.4 12.7H292.7c-10.3 0-18.4-5.3-18.4-12.7v-12.7c0-7.4 8.2-12.7 18.4-12.7h161.7c10.3 0 18.4 5.3 18.4 12.7v12.7z m289.8 215.1c0 13.8-11.2 12.7-24.6 12.7 0 0-50.2-12.7-97.3-12.7-44 0-85 12.7-85 12.7-13.3 0-24.6 1.1-24.6-12.7V380.5s19.4-26.5 72.7-35v199.2l49.1-38.2 49.1 38.2v-196c47.1 10.6 61.4 31.8 61.4 31.8v315.7h-0.8z" fill="#FFFFFF"/>`;

const qrSvg = await qrcode.toString('https://deadpan.asia/exam/doc', {
  type: 'svg', margin: 2, width: 512,
  errorCorrectionLevel: 'H',
  color: { dark: '#1a1a1a', light: '#ffffff' },
});

// QR viewBox 是 37x37，512px 宽 → 每个 viewBox 单位 = 512/37 ≈ 13.84px
// logo 占 QR 的 22% → logo 在 viewBox 中宽 37*0.22 ≈ 8
const vbTotal = 37;
const logoVb = 8;          // logo 在 viewBox 中的尺寸
const logoPadVb = 1.5;     // 内边距
const cx = vbTotal / 2;    // 中心
const half = logoVb / 2;

const final = qrSvg.replace('</svg>',
`  <g transform="translate(${(cx - half).toFixed(2)}, ${(cx - half).toFixed(2)})">
    <rect x="0" y="0" width="${logoVb}" height="${logoVb}" rx="${logoPadVb}" fill="#fff" stroke="#e0e0e0" stroke-width="0.15"/>
    <svg x="${logoPadVb}" y="${logoPadVb}" width="${logoVb - logoPadVb * 2}" height="${logoVb - logoPadVb * 2}" viewBox="0 0 1024 1024">
      ${logoPaths}
    </svg>
  </g>
</svg>`);

const dest = path.join(__dirname, 'qrcode.svg');
writeFileSync(dest, final);
console.log('QR code (with logo) saved to:', dest);
