/* Bunny Meadow — bunnies drawn in a soft, hand-illustrated cartoon style
   (thick uniform outline, flat pastel fills, tiny simple face), the way the
   Neko Atsume critters look. Each collectible is a REAL rabbit breed whose
   markings match its name. Accessories are separate overlay layers the user
   unlocks and equips per bunny in that bunny's room. */

(function () {
  "use strict";

  const OUT = "#4b3f37";   // outline (soft dark brown, not harsh black)
  const EYE = "#4b3f37";
  const NOSE = "#e08aa0";
  const MOUTH = "#6d5c50";
  let UID = 0;

  // ---- color helpers -------------------------------------------------------
  function hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { const A = hx(a), B = hx(b); return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("")}`; }
  const darken = (h, t) => mix(h, "#2a2320", t);
  const lighten = (h, t) => mix(h, "#ffffff", t);

  // ---- geometry helpers ----------------------------------------------------
  // a scalloped (bumpy) closed blob for wool / manes
  function scallop(cx, cy, rx, ry, bumps, amp) {
    let d = "";
    const pts = [];
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    for (let i = 0; i < bumps; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[(i + 1) % bumps];
      const mx = (x + nx) / 2, my = (y + ny) / 2;
      const a = Math.atan2(my - cy, mx - cx);
      const bx = mx + Math.cos(a) * amp, by = my + Math.sin(a) * amp;
      if (i === 0) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
      d += ` Q${bx.toFixed(1)},${by.toFixed(1)} ${nx.toFixed(1)},${ny.toFixed(1)}`;
    }
    return d + "Z";
  }

  // ---- ear shapes ----------------------------------------------------------
  // Ears attach to the head, which sits at the FRONT-LEFT of the loaf (center ~46,52).
  function ears(kind, col) {
    const inner = col.inner;
    if (kind === "lop" || kind === "long-lop") {
      const L = kind === "long-lop"
        ? "M33,42 C11,40 4,68 14,90 C20,104 38,98 41,74 C43,60 43,48 36,42 Z"
        : "M33,42 C13,40 6,60 15,76 C22,88 37,83 40,63 Z";
      const R = kind === "long-lop"
        ? "M58,40 C78,38 86,58 79,78 C74,92 58,88 55,68 C53,54 52,44 58,40 Z"
        : "M57,40 C74,38 82,54 75,70 C69,82 55,78 53,60 Z";
      return {
        back: `<path d="${L}" fill="${col.earFur}" stroke="${OUT}" stroke-width="3"/><path d="${R}" fill="${col.earFur}" stroke="${OUT}" stroke-width="3"/>`,
        front: `<path d="M24,52 C18,60 20,70 27,73 C31,65 31,57 29,52 Z" fill="${inner}" opacity="0.85"/><path d="M65,50 C71,57 69,67 63,70 C59,62 59,55 61,50 Z" fill="${inner}" opacity="0.85"/>`,
      };
    }
    // upright (short-upright = stubbier)
    const bl = kind === "short-upright" ? 18 : 4; // ear top y
    const L = `M38,36 C33,${bl + 8} 35,${bl} 41,${bl} C47,${bl} 46,${bl + 12} 45,36 Z`;
    const R = `M54,36 C59,${bl + 8} 57,${bl} 51,${bl} C45,${bl} 46,${bl + 12} 47,36 Z`;
    const iL = `M40,34 C37,${bl + 10} 38,${bl + 5} 42,${bl + 5} C46,${bl + 5} 45,${bl + 13} 44,34 Z`;
    const iR = `M52,34 C55,${bl + 10} 54,${bl + 5} 50,${bl + 5} C46,${bl + 5} 47,${bl + 13} 46,34 Z`;
    return {
      back: `<path d="${L}" fill="${col.earFur}" stroke="${OUT}" stroke-width="3"/><path d="${R}" fill="${col.earFur}" stroke="${OUT}" stroke-width="3"/>`,
      front: `<path d="${iL}" fill="${inner}"/><path d="${iR}" fill="${inner}"/>`,
    };
  }

  // ---- markings (clipped to the body) --------------------------------------
  function markings(breed, col, clip) {
    const c2 = col.mark, b = col.belly;
    const g = (inner) => `<g clip-path="url(#${clip})">${inner}</g>`;
    switch (breed.pattern) {
      case "dutch-blaze":
        // white front (head + chest), colored rear haunch, colored cheeks, ears colored, white blaze
        return g(`
          <ellipse cx="96" cy="68" rx="30" ry="30" fill="${c2}"/>
          <ellipse cx="33" cy="52" rx="8" ry="11" fill="${c2}"/>
          <ellipse cx="59" cy="52" rx="8" ry="11" fill="${c2}"/>`);
      case "himalayan-points":
        return g(`<ellipse cx="74" cy="99" rx="34" ry="8" fill="${c2}"/>`); // dark feet shadow; ears + nose + paws handled elsewhere
      case "english-spot":
        return g(`
          <path d="M50,32 Q86,26 118,54" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <ellipse cx="46" cy="58" rx="6" ry="3" fill="${c2}"/>
          <circle cx="86" cy="78" r="5" fill="${c2}"/><circle cx="102" cy="70" r="4.4" fill="${c2}"/>
          <circle cx="74" cy="86" r="4" fill="${c2}"/><circle cx="96" cy="86" r="3.6" fill="${c2}"/>`);
      case "broken":
        return g(`
          <ellipse cx="38" cy="45" rx="11" ry="11" fill="${c2}"/>
          <ellipse cx="92" cy="70" rx="18" ry="17" fill="${c2}"/>`);
      case "harlequin-split":
        return g(`<rect x="66" y="20" width="66" height="96" fill="${c2}"/><ellipse cx="33" cy="52" rx="9" ry="12" fill="${c2}"/>`);
      case "tan-otter":
        return g(`
          <ellipse cx="80" cy="90" rx="34" ry="15" fill="${b}"/>
          <ellipse cx="46" cy="62" rx="11" ry="7" fill="${b}"/>
          <circle cx="39" cy="50" r="5.5" fill="${b}"/><circle cx="53" cy="50" r="5.5" fill="${b}"/>`);
      case "agouti-ticked":
        return g(`
          <ellipse cx="80" cy="90" rx="30" ry="13" fill="${lighten(col.coat, 0.28)}"/>
          <ellipse cx="46" cy="62" rx="9" ry="6" fill="${lighten(col.coat, 0.22)}"/>
          <g fill="${darken(col.coat, 0.4)}" opacity="0.45">
            ${[[64, 44], [84, 48], [98, 60], [72, 58], [90, 74], [56, 50], [104, 72], [78, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7"/>`).join("")}
          </g>`);
      default:
        return "";
    }
  }

  // ---- fur overlays (wool handled separately in render) --------------------
  function furOverlay(breed, col) {
    if (breed.fur === "mane") {
      // a fluffy ruff ringing the face, carved open in the middle so the face shows
      return `<path d="${scallop(46, 52, 29, 29, 14, 6)}" fill="${col.mark}" stroke="${OUT}" stroke-width="3"/><circle cx="46" cy="53" r="17" fill="${col.coat}"/>`;
    }
    if (breed.fur === "plush") {
      return `<ellipse cx="72" cy="56" rx="16" ry="12" fill="#ffffff" opacity="0.12"/>`;
    }
    if (breed.fur === "satin") {
      return `<ellipse cx="74" cy="58" rx="18" ry="10" fill="#ffffff" opacity="0.22" transform="rotate(-18 74 58)"/>`;
    }
    return "";
  }

  // ---- master render -------------------------------------------------------
  function colorsFor(breed) {
    const points = breed.pattern === "himalayan-points";
    return {
      coat: breed.coat,
      mark: breed.mark,
      belly: breed.belly,
      inner: points ? lighten(breed.mark, 0.18) : (breed.inner || "#f3b9c6"),
      earFur: points ? breed.mark
        : (breed.pattern === "dutch-blaze" || breed.pattern === "broken" || breed.pattern === "english-spot") ? breed.mark
          : (breed.fur === "wool" ? lighten(breed.coat, 0.1) : breed.coat),
    };
  }

  function render(breed, size, opts) {
    opts = opts || {};
    const col = colorsFor(breed);
    const id = "bmc" + (UID++);
    const px = size || 120;
    const sz = { tiny: 0.86, small: 0.93, medium: 1, large: 1.06, giant: 1.13 }[breed.sizeCue] || 1;
    const wool = breed.fur === "wool";
    const ruby = breed.eye === "ruby";
    const points = breed.pattern === "himalayan-points";
    const VW = 132, VH = 116;
    const wrap = (inner) => `<svg viewBox="0 0 ${VW} ${VH}" width="${px}" height="${(px * VH / VW).toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(breed.breed)}"><g transform="translate(64 60) scale(${sz}) translate(-64 -60)">${inner}</g></svg>`;
    const accessory = opts.accessory ? drawAccessory(opts.accessory, breed) : "";

    // ---- wool breeds: a fluffy loaf cloud with a small front face ----
    if (wool) {
      const cloud = scallop(62, 62, 46, 38, 18, 6);
      const tinyEars = `<path d="M40,34 C37,16 38,10 43,10 C48,10 47,22 46,36 Z" fill="${lighten(col.coat, 0.05)}" stroke="${OUT}" stroke-width="2.6"/><path d="M54,34 C57,16 56,10 51,10 C46,10 47,22 48,36 Z" fill="${lighten(col.coat, 0.05)}" stroke="${OUT}" stroke-width="2.6"/>`;
      return wrap(`<defs><clipPath id="${id}"><path d="${cloud}"/></clipPath></defs>
        ${tinyEars}
        <path d="${cloud}" fill="${col.coat}" stroke="${OUT}" stroke-width="3"/>
        <g clip-path="url(#${id})"><path d="${scallop(60, 60, 38, 30, 16, 5)}" fill="${lighten(col.coat, 0.13)}"/></g>
        <ellipse cx="34" cy="64" rx="4" ry="2.6" fill="#f4a9bd" opacity="0.4"/>
        <ellipse cx="37" cy="58" rx="2.6" ry="3" fill="${EYE}"/><ellipse cx="51" cy="58" rx="2.6" ry="3" fill="${EYE}"/>
        <path d="M41,64 h5 l-2.5,2.6 Z" fill="${NOSE}"/>
        ${accessory}
      </svg>`);
    }

    // ---- crouching loaf: head (front-left) + body/haunch (back-right) ----
    const E = ears(breed.ears, col);
    const tail = `<ellipse cx="116" cy="58" rx="8.5" ry="8.5" fill="${col.belly}" stroke="${OUT}" stroke-width="3"/>`;
    const pawFill = points ? col.mark : col.coat;
    const paws = `<ellipse cx="50" cy="94" rx="9" ry="6" fill="${pawFill}" stroke="${OUT}" stroke-width="3"/><ellipse cx="80" cy="98" rx="10" ry="6" fill="${pawFill}" stroke="${OUT}" stroke-width="3"/>`;
    const bodyLayer = `<ellipse cx="84" cy="70" rx="42" ry="31" fill="${col.coat}" stroke="${OUT}" stroke-width="3.2"/><circle cx="46" cy="52" r="26" fill="${col.coat}" stroke="${OUT}" stroke-width="3.2"/>`;

    const eyeFill = ruby ? "#c65563" : EYE;
    const eyes = `<ellipse cx="39" cy="50" rx="2.9" ry="3.9" fill="${eyeFill}"/><ellipse cx="53" cy="50" rx="2.9" ry="3.9" fill="${eyeFill}"/>`;
    const muzzle = `<ellipse cx="46" cy="61" rx="10" ry="7" fill="${lighten(col.belly, 0.15)}" opacity="${breed.pattern === "tan-otter" ? 0 : 0.5}"/>`;
    const nose = points
      ? `<ellipse cx="46" cy="59" rx="3.4" ry="2.6" fill="${col.mark}"/>`
      : `<path d="M42.5,58 h7 l-3.5,3.2 Z" fill="${NOSE}"/>`;
    const mouth = `<path d="M46,${points ? 62 : 61} q-3.3,3.4 -6.4,1.2 M46,${points ? 62 : 61} q3.3,3.4 6.4,1.2" fill="none" stroke="${MOUTH}" stroke-width="1.5" stroke-linecap="round"/>`;
    const blush = `<ellipse cx="31" cy="57" rx="4" ry="2.6" fill="#f4a9bd" opacity="0.5"/><ellipse cx="61" cy="57" rx="4" ry="2.6" fill="#f4a9bd" opacity="0.5"/>`;

    return wrap(`<defs><clipPath id="${id}"><circle cx="46" cy="52" r="26"/><ellipse cx="84" cy="70" rx="42" ry="31"/></clipPath></defs>
      ${tail}
      ${E.back}
      ${bodyLayer}
      ${markings(breed, col, id)}
      ${furOverlay(breed, col)}
      ${E.front}
      ${paws}
      ${muzzle}
      ${eyes}
      ${nose}
      ${mouth}
      ${blush}
      ${accessory}
    </svg>`);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---- accessories (overlay layers, unlockable + equippable) ---------------
  // Each draws near the head/ears on the same 120x122 canvas.
  // Accessories sit on the head, which is at the front-left of the loaf
  // (head center ~46,52; ear tips ~y4; eyes cy50; neck/collar ~y74).
  const ACC_DRAW = {
    bow: () => `<g transform="translate(53 24)"><path d="M0,0 L-10,-6 L-10,6 Z" fill="#f28fb1" stroke="${OUT}" stroke-width="2"/><path d="M0,0 L10,-6 L10,6 Z" fill="#f28fb1" stroke="${OUT}" stroke-width="2"/><circle r="3.6" fill="#e97aa0" stroke="${OUT}" stroke-width="2"/></g>`,
    flower: () => `<g transform="translate(54 22)">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${5.5 * Math.cos(a * Math.PI / 180)}" cy="${5.5 * Math.sin(a * Math.PI / 180)}" r="3.8" fill="#f7b8d0" stroke="${OUT}" stroke-width="1.5"/>`).join("")}<circle r="3" fill="#ffe08a" stroke="${OUT}" stroke-width="1.3"/></g>`,
    flowercrown: () => `<g>${[28, 38, 48, 58, 66].map((x, i) => `<g transform="translate(${x} ${30 - (i % 2) * 2})">${[0, 90, 180, 270].map((a) => `<circle cx="${3.6 * Math.cos(a * Math.PI / 180)}" cy="${3.6 * Math.sin(a * Math.PI / 180)}" r="3" fill="${["#f7b8d0", "#c8b6ef", "#ffd9a3", "#bfe5c8", "#a9d4f0"][i]}" stroke="${OUT}" stroke-width="1.2"/>`).join("")}<circle r="2" fill="#ffe9a8"/></g>`).join("")}</g>`,
    scarf: () => `<g><path d="M28,68 Q46,80 64,69 L62,79 Q46,89 30,79 Z" fill="#f2a9c0" stroke="${OUT}" stroke-width="2.4"/><path d="M56,77 L64,94 L71,90 L64,74 Z" fill="#ef97b3" stroke="${OUT}" stroke-width="2"/></g>`,
    bandana: () => `<path d="M28,66 Q46,78 64,67 L46,88 Z" fill="#8fb7f2" stroke="${OUT}" stroke-width="2.4"/>`,
    sunhat: () => `<g><ellipse cx="46" cy="30" rx="40" ry="10" fill="#ffe4a8" stroke="${OUT}" stroke-width="2.6"/><path d="M28,30 Q46,4 64,30 Z" fill="#ffd98a" stroke="${OUT}" stroke-width="2.6"/><path d="M28,29 Q46,21 64,29" fill="none" stroke="#f2a9c0" stroke-width="4"/></g>`,
    partyhat: () => `<g><path d="M46,-4 L34,28 L58,28 Z" fill="#c8b6ef" stroke="${OUT}" stroke-width="2.6"/><circle cx="46" cy="-4" r="4" fill="#ffd76a" stroke="${OUT}" stroke-width="2"/><circle cx="41" cy="14" r="2.4" fill="#fff"/><circle cx="51" cy="20" r="2.4" fill="#fff"/></g>`,
    crown: () => `<g transform="translate(46 24)"><path d="M-18,7 L-18,-8 L-9,2 L0,-12 L9,2 L18,-8 L18,7 Z" fill="#ffd76a" stroke="${OUT}" stroke-width="2.2"/><circle cx="-9" cy="-7" r="2.4" fill="#f7a8c4"/><circle cx="0" cy="-13" r="2.6" fill="#a9d8f0"/><circle cx="9" cy="-7" r="2.4" fill="#f7a8c4"/></g>`,
    glasses: () => `<g fill="#ffffff" fill-opacity="0.22" stroke="${OUT}" stroke-width="2.2"><circle cx="39" cy="50" r="7.5"/><circle cx="53" cy="50" r="7.5"/></g><path d="M46.5,50 h-1" stroke="${OUT}" stroke-width="2.2"/>`,
    sunglasses: () => `<g><rect x="31" y="45" width="14" height="10" rx="4" fill="#3a3330" stroke="${OUT}" stroke-width="2"/><rect x="47" y="45" width="14" height="10" rx="4" fill="#3a3330" stroke="${OUT}" stroke-width="2"/><path d="M45,48 h2" stroke="${OUT}" stroke-width="2"/></g>`,
    headphones: () => `<g fill="none" stroke="#b6a6e6" stroke-width="5"><path d="M28,32 Q46,6 64,32"/></g><rect x="24" y="32" width="9" height="15" rx="4" fill="#b6a6e6" stroke="${OUT}" stroke-width="2"/><rect x="59" y="32" width="9" height="15" rx="4" fill="#b6a6e6" stroke="${OUT}" stroke-width="2"/>`,
    star: () => `<g transform="translate(54 22)"><path d="M0,-7 L2,-2 L7,-2 L3,1.5 L4.5,6.5 L0,3.5 L-4.5,6.5 L-3,1.5 L-7,-2 L-2,-2 Z" fill="#ffd76a" stroke="${OUT}" stroke-width="1.6"/></g>`,
    bell: () => `<g><path d="M28,70 Q46,82 64,71 L62,79 Q46,88 30,79 Z" fill="#ef97b3" stroke="${OUT}" stroke-width="2.2"/><circle cx="46" cy="82" r="4.5" fill="#ffd76a" stroke="${OUT}" stroke-width="2"/><circle cx="46" cy="83" r="1.1" fill="${OUT}"/></g>`,
    medal: () => `<g transform="translate(46 80)"><path d="M-6,-9 L-2,4 M6,-9 L2,4" stroke="#f2a9c0" stroke-width="3"/><circle cx="0" cy="7" r="7.5" fill="#ffd76a" stroke="${OUT}" stroke-width="2"/><path d="M0,3 L1.3,6 L4.4,6 L2,8 L3,11 L0,9.2 L-3,11 L-2,8 L-4.4,6 L-1.3,6 Z" fill="#e9a93d"/></g>`,
  };
  function drawAccessory(accId, breed) {
    const fn = ACC_DRAW[accId];
    return fn ? fn(breed) : "";
  }

  const ACCESSORIES = [
    { id: "bow", name: "Ribbon Bow", cost: 20 },
    { id: "flower", name: "Ear Flower", cost: 20 },
    { id: "bandana", name: "Bandana", cost: 30 },
    { id: "scarf", name: "Cozy Scarf", cost: 40 },
    { id: "glasses", name: "Round Glasses", cost: 45 },
    { id: "star", name: "Star Clip", cost: 45 },
    { id: "bell", name: "Bell Collar", cost: 55 },
    { id: "sunglasses", name: "Sunglasses", cost: 60 },
    { id: "flowercrown", name: "Flower Crown", cost: 75 },
    { id: "headphones", name: "Headphones", cost: 80 },
    { id: "sunhat", name: "Sun Hat", cost: 90 },
    { id: "partyhat", name: "Party Hat", cost: 100 },
    { id: "medal", name: "Gold Medal", cost: 140 },
    { id: "crown", name: "Royal Crown", cost: 200 },
  ];
  const ACC_BY_ID = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));

  // ---- breed catalog (24 real breeds) --------------------------------------
  // coat = main fur, mark = markings/points, belly = light trim, inner = ear pink
  const CATALOG = [
    { id: "dutch", breed: "Dutch", ears: "upright", fur: "normal", pattern: "dutch-blaze", sizeCue: "small", rarity: "common", coat: "#ffffff", mark: "#5b4a3a", belly: "#ffffff", inner: "#e9c7b6" },
    { id: "netherland-dwarf", breed: "Netherland Dwarf", ears: "short-upright", fur: "normal", pattern: "solid", sizeCue: "tiny", rarity: "common", coat: "#c3b8ad", mark: "#8c8079", belly: "#e9e2da" },
    { id: "holland-lop", breed: "Holland Lop", ears: "lop", fur: "normal", pattern: "broken", sizeCue: "small", rarity: "common", coat: "#ffffff", mark: "#cb9d70", belly: "#ffffff", inner: "#eec3b0" },
    { id: "mini-lop", breed: "Mini Lop", ears: "lop", fur: "normal", pattern: "broken", sizeCue: "medium", rarity: "common", coat: "#ffffff", mark: "#9a9089", belly: "#ffffff" },
    { id: "californian", breed: "Californian", ears: "upright", fur: "normal", pattern: "himalayan-points", sizeCue: "large", rarity: "common", coat: "#fbfaf8", mark: "#3a3a40", belly: "#ffffff", eye: "ruby", inner: "#d9c3c3" },
    { id: "chinchilla", breed: "Chinchilla", ears: "upright", fur: "normal", pattern: "agouti-ticked", sizeCue: "medium", rarity: "common", coat: "#94918d", mark: "#5e5b58", belly: "#cfccc8" },
    { id: "mini-rex", breed: "Mini Rex", ears: "upright", fur: "plush", pattern: "solid", sizeCue: "small", rarity: "common", coat: "#8f6a9c", mark: "#5a3f66", belly: "#a98ab4", inner: "#d8b9e2" },

    { id: "polish", breed: "Polish", ears: "short-upright", fur: "normal", pattern: "solid", sizeCue: "tiny", rarity: "uncommon", coat: "#fdfdfb", mark: "#e2d8cc", belly: "#ffffff", eye: "ruby" },
    { id: "french-lop", breed: "French Lop", ears: "lop", fur: "normal", pattern: "solid", sizeCue: "large", rarity: "uncommon", coat: "#9a9088", mark: "#6b625b", belly: "#c7beb4" },
    { id: "jersey-wooly", breed: "Jersey Wooly", ears: "short-upright", fur: "wool", pattern: "solid", sizeCue: "tiny", rarity: "uncommon", coat: "#cbc2b8", mark: "#948a80", belly: "#e7e0d8" },
    { id: "himalayan", breed: "Himalayan", ears: "upright", fur: "normal", pattern: "himalayan-points", sizeCue: "small", rarity: "uncommon", coat: "#fbfaf8", mark: "#3a3a3e", belly: "#ffffff", eye: "ruby", inner: "#e4c9c9" },
    { id: "english-spot", breed: "English Spot", ears: "upright", fur: "normal", pattern: "english-spot", sizeCue: "medium", rarity: "uncommon", coat: "#ffffff", mark: "#4a4038", belly: "#ffffff", inner: "#e9c7b6" },
    { id: "tan", breed: "Tan", ears: "upright", fur: "normal", pattern: "tan-otter", sizeCue: "small", rarity: "uncommon", coat: "#2f2a24", mark: "#171310", belly: "#d98a3d", inner: "#c98a5c" },
    { id: "cinnamon", breed: "Cinnamon", ears: "upright", fur: "normal", pattern: "agouti-ticked", sizeCue: "large", rarity: "uncommon", coat: "#a9663a", mark: "#7c4a28", belly: "#c98a5c" },
    { id: "rex", breed: "Rex", ears: "upright", fur: "plush", pattern: "solid", sizeCue: "medium", rarity: "uncommon", coat: "#6a5238", mark: "#3e3020", belly: "#8a6e4e" },
    { id: "chinchilla-lop", breed: "Chinchilla Lop", ears: "lop", fur: "normal", pattern: "agouti-ticked", sizeCue: "medium", rarity: "uncommon", coat: "#94918d", mark: "#5e5b58", belly: "#cfccc8" },

    { id: "english-lop", breed: "English Lop", ears: "long-lop", fur: "normal", pattern: "broken", sizeCue: "large", rarity: "rare", coat: "#ffffff", mark: "#a9764b", belly: "#ffffff", inner: "#eec3b0" },
    { id: "lionhead", breed: "Lionhead", ears: "upright", fur: "mane", pattern: "solid", sizeCue: "small", rarity: "rare", coat: "#e8b77a", mark: "#c98a4e", belly: "#f3ddbc" },
    { id: "checkered-giant", breed: "Checkered Giant", ears: "upright", fur: "normal", pattern: "english-spot", sizeCue: "giant", rarity: "rare", coat: "#ffffff", mark: "#2e2e34", belly: "#ffffff", inner: "#d9d9de" },
    { id: "silver-marten", breed: "Silver Marten", ears: "upright", fur: "normal", pattern: "tan-otter", sizeCue: "medium", rarity: "rare", coat: "#2c2c31", mark: "#141418", belly: "#d9dee2", inner: "#a7acb2" },
    { id: "satin", breed: "Satin", ears: "upright", fur: "satin", pattern: "solid", sizeCue: "large", rarity: "rare", coat: "#b95546", mark: "#8a3428", belly: "#e08a6e" },

    { id: "flemish-giant", breed: "Flemish Giant", ears: "upright", fur: "normal", pattern: "solid", sizeCue: "giant", rarity: "epic", coat: "#a6acb1", mark: "#6e747a", belly: "#c3c8cc" },
    { id: "harlequin", breed: "Harlequin", ears: "upright", fur: "normal", pattern: "harlequin-split", sizeCue: "medium", rarity: "epic", coat: "#e58b2e", mark: "#2a2a2e", belly: "#f0c48a" },

    { id: "english-angora", breed: "English Angora", ears: "short-upright", fur: "wool", pattern: "solid", sizeCue: "small", rarity: "legendary", coat: "#fbf3ec", mark: "#ecdccb", belly: "#ffffff", inner: "#f0d9cb" },
  ];

  const RARITY = {
    common: { label: "Common", color: "#bfe5c8" },
    uncommon: { label: "Uncommon", color: "#a9d8f0" },
    rare: { label: "Rare", color: "#c8b6ef" },
    epic: { label: "Epic", color: "#f7b8d0" },
    legendary: { label: "Legendary", color: "#ffd76a" },
  };

  const byId = Object.fromEntries(CATALOG.map((b) => [b.id, b]));
  const byRarity = (r) => CATALOG.filter((b) => b.rarity === r);

  window.BUNNIES = {
    CATALOG, RARITY, ACCESSORIES, ACC_BY_ID, byId, byRarity, render,
    // a peaceful sleeping bunny for the lock screen
    sleeping(size) {
      const px = size || 150;
      return `
<svg viewBox="0 0 120 120" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="60" cy="82" rx="42" ry="26" fill="#fdf6f9" stroke="${OUT}" stroke-width="3.2"/>
  <path d="M30,74 C20,68 14,84 24,90 C32,94 38,84 36,76 Z" fill="#fdf6f9" stroke="${OUT}" stroke-width="3"/>
  <path d="M90,74 C100,68 106,84 96,90 C88,94 82,84 84,76 Z" fill="#fdf6f9" stroke="${OUT}" stroke-width="3"/>
  <path d="M42,80 Q47,84 52,80" fill="none" stroke="${OUT}" stroke-width="2" stroke-linecap="round"/>
  <path d="M68,80 Q73,84 78,80" fill="none" stroke="${OUT}" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="47" cy="86" rx="4.5" ry="3" fill="#f4a9bd" opacity="0.5"/>
  <ellipse cx="73" cy="86" rx="4.5" ry="3" fill="#f4a9bd" opacity="0.5"/>
  <path d="M56,85 h8 l-4,3.6 Z" fill="${NOSE}"/>
  <text x="92" y="52" font-size="13" fill="#c8b6ef">z</text>
  <text x="101" y="40" font-size="17" fill="#c8b6ef">Z</text>
</svg>`.trim();
    },
  };
})();
