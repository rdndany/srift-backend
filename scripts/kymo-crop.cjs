// Cut a piece out of a kymograph (see shadow-kymo.mjs) and blow it up. Usage: node scripts/kymo-crop.cjs in.png out.png left width [top=0] [height=600] [scale=2]
const sharp = require('sharp');
const [input, output, left, width, top = '0', height = '600', scale = '2'] = process.argv.slice(2);
(async () => {
  const m = await sharp(input).metadata();
  const h = Math.min(Number(height), m.height - Number(top));
  await sharp(input)
    .extract({ left: Number(left), top: Number(top), width: Math.min(Number(width), m.width - Number(left)), height: h })
    .resize({ width: Math.round(Math.min(Number(width), m.width - Number(left)) * Number(scale)), kernel: 'nearest' })
    .toFile(output);
  console.log(m.width, m.height);
})();
