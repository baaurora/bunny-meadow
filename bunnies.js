/* Bunny Meadow — collectible bunnies backed by hand-illustrated PNG art
   (in /bunnies). Each collectible is one artwork; accessories are drawn as
   small SVG icons overlaid near the head. */
(function () {
  "use strict";
  const BASE = "bunnies/";
  const OUT = "#3f352e";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // id matches the PNG filenames (bunnies/<id>-<pose>.png). poses: how many
  // pose images exist (0 = sitting portrait, then laying, then sleeping).
  // Named by real rabbit breed. `nick` kept for flavor (used in copy).
  const CATALOG = [
    { id: "marshmallow", breed: "White", nick: "Marshmallow", rarity: "common", poses: 3 },
    { id: "domino", breed: "Dutch", nick: "Domino", rarity: "common", poses: 3 },
    { id: "biscuit", breed: "Holland Lop", nick: "Biscuit", rarity: "common", poses: 3 },
    { id: "pip", breed: "Netherland Dwarf", nick: "Pip", rarity: "common", poses: 3 },

    { id: "acorn", breed: "Mini Lop", nick: "Acorn", rarity: "uncommon", poses: 3 },
    { id: "marmalade", breed: "Thrianta", nick: "Marmalade", rarity: "uncommon", poses: 3 },
    { id: "frost", breed: "Himalayan", nick: "Frost", rarity: "uncommon", poses: 2 },

    { id: "leo", breed: "Lionhead", nick: "Leo", rarity: "rare", poses: 1 },
    { id: "cloud", breed: "Angora", nick: "Cloud", rarity: "rare", poses: 3 },

    { id: "patch", breed: "Harlequin", nick: "Patch", rarity: "epic", poses: 3 },

    { id: "sunny", breed: "Fuzzy Lop", nick: "Sunny", rarity: "legendary", poses: 2 },
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

  // ---- accessory icons (centered in a 100x100 box, drawn near the head) ----
  const st = (w) => `stroke="${OUT}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const ACC_ICON = {
    bow: () => `<g transform="translate(50 55)"><path d="M0,0 L-22,-13 L-22,13 Z" fill="#f28fb1" ${st(4)}/><path d="M0,0 L22,-13 L22,13 Z" fill="#f28fb1" ${st(4)}/><circle r="8" fill="#e97aa0" ${st(4)}/></g>`,
    flower: () => `<g transform="translate(50 50)">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${20 * Math.cos(a * Math.PI / 180)}" cy="${20 * Math.sin(a * Math.PI / 180)}" r="14" fill="#f7b8d0" ${st(3)}/>`).join("")}<circle r="11" fill="#ffe08a" ${st(3)}/></g>`,
    flowercrown: () => `<g transform="translate(0 6)">${[24, 50, 76].map((x, i) => `<g transform="translate(${x} 50)">${[0, 90, 180, 270].map((a) => `<circle cx="${10 * Math.cos(a * Math.PI / 180)}" cy="${10 * Math.sin(a * Math.PI / 180)}" r="8" fill="${["#f7b8d0", "#c8b6ef", "#a9d4f0"][i]}" ${st(2.5)}/>`).join("")}<circle r="5" fill="#ffe9a8"/></g>`).join("")}</g>`,
    scarf: () => `<g transform="translate(50 55)"><path d="M-26,-8 Q0,10 26,-8 L23,10 Q0,26 -23,10 Z" fill="#f2a9c0" ${st(4)}/><path d="M16,6 L30,40 L44,32 L30,0 Z" fill="#ef97b3" ${st(3.5)}/></g>`,
    bandana: () => `<path d="M20,42 Q50,64 80,42 L50,86 Z" fill="#8fb7f2" ${st(4)}/>`,
    sunhat: () => `<g><ellipse cx="50" cy="60" rx="42" ry="12" fill="#ffe4a8" ${st(4)}/><path d="M28,60 Q50,18 72,60 Z" fill="#ffd98a" ${st(4)}/><path d="M28,58 Q50,46 72,58" fill="none" stroke="#f2a9c0" stroke-width="7"/></g>`,
    partyhat: () => `<g><path d="M50,8 L30,62 L70,62 Z" fill="#c8b6ef" ${st(4)}/><circle cx="50" cy="8" r="7" fill="#ffd76a" ${st(3.5)}/><circle cx="42" cy="36" r="4" fill="#fff"/><circle cx="56" cy="46" r="4" fill="#fff"/></g>`,
    crown: () => `<g transform="translate(50 50)"><path d="M-30,14 L-30,-14 L-15,2 L0,-20 L15,2 L30,-14 L30,14 Z" fill="#ffd76a" ${st(4)}/><circle cx="-15" cy="-12" r="4" fill="#f7a8c4"/><circle cx="0" cy="-22" r="5" fill="#a9d8f0"/><circle cx="15" cy="-12" r="4" fill="#f7a8c4"/></g>`,
    glasses: () => `<g fill="#ffffff" fill-opacity="0.28" ${st(5)}><circle cx="34" cy="52" r="17"/><circle cx="66" cy="52" r="17"/></g><path d="M50,52 h1" ${st(5)}/>`,
    sunglasses: () => `<g><rect x="16" y="40" width="30" height="22" rx="8" fill="#3a3330" ${st(4)}/><rect x="54" y="40" width="30" height="22" rx="8" fill="#3a3330" ${st(4)}/><path d="M46,46 h8" ${st(4)}/></g>`,
    headphones: () => `<g fill="none" stroke="#b6a6e6" stroke-width="10"><path d="M18,52 Q50,6 82,52"/></g><rect x="10" y="48" width="18" height="30" rx="8" fill="#b6a6e6" ${st(4)}/><rect x="72" y="48" width="18" height="30" rx="8" fill="#b6a6e6" ${st(4)}/>`,
    star: () => `<g transform="translate(50 48)"><path d="M0,-30 L9,-9 L31,-9 L13,5 L20,28 L0,14 L-20,28 L-13,5 L-31,-9 L-9,-9 Z" fill="#ffd76a" ${st(3.5)}/></g>`,
    bell: () => `<g transform="translate(50 48)"><path d="M-26,-2 Q0,16 26,-2 L22,10 Q0,22 -22,10 Z" fill="#ef97b3" ${st(3.5)}/><circle cx="0" cy="16" r="12" fill="#ffd76a" ${st(4)}/><circle cx="0" cy="18" r="3" fill="${OUT}"/></g>`,
    medal: () => `<g transform="translate(50 44)"><path d="M-14,-22 L-4,10 M14,-22 L4,10" stroke="#f2a9c0" stroke-width="6"/><circle cx="0" cy="20" r="18" fill="#ffd76a" ${st(4)}/><path d="M0,10 L3.5,17 L11,17 L5,22 L7,30 L0,25 L-7,30 L-5,22 L-11,17 L-3.5,17 Z" fill="#e9a93d"/></g>`,
    monocle: () => `<g><circle cx="42" cy="54" r="17" fill="#ffffff" fill-opacity="0.25" ${st(5)}/><path d="M42,71 q-4,14 4,20" fill="none" ${st(3)}/></g>`,
    tophat: () => `<g><ellipse cx="50" cy="60" rx="40" ry="9" fill="#3a3340" ${st(4)}/><rect x="28" y="14" width="44" height="46" rx="4" fill="#3a3340" ${st(4)}/><rect x="26" y="50" width="48" height="9" rx="4" fill="#c8b6ef" ${st(3)}/></g>`,
    tiara: () => `<g transform="translate(50 52)"><path d="M-30,10 C-24,-8 -16,-8 -12,4 C-8,-14 8,-14 12,4 C16,-8 24,-8 30,10 Z" fill="#ffe08a" ${st(4)}/><circle cx="0" cy="-9" r="5" fill="#a9d4f0" ${st(3)}/><circle cx="-15" cy="2" r="3.5" fill="#f7b8d0" ${st(2.5)}/><circle cx="15" cy="2" r="3.5" fill="#f7b8d0" ${st(2.5)}/></g>`,
  };
  function accessorySwatch(id, size) {
    const dim = size ? ` width="${size}" height="${size}"` : "";
    const fn = ACC_ICON[id];
    return `<svg viewBox="0 0 100 100"${dim} xmlns="http://www.w3.org/2000/svg">${fn ? fn() : ""}</svg>`;
  }

  // opts.pose picks a pose image (0=sitting portrait). Omit for the portrait.
  function render(b, size, opts) {
    opts = opts || {};
    const px = size || 120;
    const np = b.poses || 1;
    const pose = opts.pose == null ? 0 : ((opts.pose % np) + np) % np;
    const acc = opts.accessory && ACC_ICON[opts.accessory]
      ? `<div class="bacc">${accessorySwatch(opts.accessory, 0)}</div>` : "";
    return `<div class="bwrap" style="width:${px}px;height:${px}px">
      <img class="bimg" src="${BASE}${b.id}-${pose}.png" alt="${esc(b.breed)}" draggable="false" />
      ${acc}
    </div>`;
  }

  const ACCESSORIES = [
    { id: "bow", name: "Ribbon Bow", cost: 20 },
    { id: "flower", name: "Ear Flower", cost: 20 },
    { id: "bandana", name: "Bandana", cost: 30 },
    { id: "scarf", name: "Cozy Scarf", cost: 40 },
    { id: "glasses", name: "Round Glasses", cost: 45 },
    { id: "star", name: "Star Clip", cost: 45 },
    { id: "monocle", name: "Monocle", cost: 50 },
    { id: "bell", name: "Bell Collar", cost: 55 },
    { id: "sunglasses", name: "Sunglasses", cost: 60 },
    { id: "flowercrown", name: "Flower Crown", cost: 75 },
    { id: "headphones", name: "Headphones", cost: 80 },
    { id: "sunhat", name: "Sun Hat", cost: 90 },
    { id: "partyhat", name: "Party Hat", cost: 100 },
    { id: "tophat", name: "Top Hat", cost: 120 },
    { id: "tiara", name: "Tiara", cost: 150 },
    { id: "medal", name: "Gold Medal", cost: 140 },
    { id: "crown", name: "Royal Crown", cost: 200 },
  ];
  const ACC_BY_ID = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));

  // ---- toys: little props that decorate the meadow when owned ----
  const TOY_ICON = {
    carrot: () => `<g transform="translate(50 50)"><path d="M-14,-14 L18,18 C22,22 10,34 0,30 C-16,24 -26,10 -22,-6 C-24,-16 -18,-18 -14,-14 Z" fill="#f2934e" ${st(4)}/><path d="M-14,-14 C-22,-24 -14,-30 -8,-28 M-14,-14 C-18,-26 -8,-32 -4,-26 M-14,-14 C-6,-24 2,-22 0,-14" fill="none" stroke="#6cbf5a" stroke-width="5"/></g>`,
    ball: () => `<g transform="translate(50 52)"><circle r="26" fill="#f7b8d0" ${st(4)}/><path d="M-26,0 h52 M0,-26 v52 M-18,-18 Q0,0 18,18 M18,-18 Q0,0 -18,18" fill="none" stroke="#e97aa0" stroke-width="3"/></g>`,
    hay: () => `<g transform="translate(50 54)"><ellipse cx="0" cy="0" rx="30" ry="22" fill="#f4d98a" ${st(4)}/><path d="M-24,-8 h48 M-26,2 h52 M-22,12 h44" stroke="#d9b45e" stroke-width="3"/></g>`,
    house: () => `<g transform="translate(50 52)"><path d="M-26,6 L0,-24 L26,6 Z" fill="#f4a9c0" ${st(4)}/><rect x="-20" y="6" width="40" height="22" rx="3" fill="#ffe4a8" ${st(4)}/><circle cx="0" cy="17" r="7" fill="#c98a5c" ${st(3)}/></g>`,
    tunnel: () => `<g transform="translate(50 56)"><path d="M-30,14 A30,26 0 0 1 30,14 Z" fill="#a9d4f0" ${st(4)}/><ellipse cx="0" cy="14" rx="14" ry="12" fill="#5a7a99"/></g>`,
    flowerpatch: () => `<g transform="translate(50 56)">${[[-18,4],[0,-6],[18,6]].map(([x,y])=>`<g transform="translate(${x} ${y})">${[0,72,144,216,288].map(a=>`<circle cx="${8*Math.cos(a*Math.PI/180)}" cy="${8*Math.sin(a*Math.PI/180)}" r="5.5" fill="#f7b8d0" ${st(2.5)}/>`).join("")}<circle r="4" fill="#ffe08a"/></g>`).join("")}</g>`,
  };
  function toySwatch(id, size) {
    const dim = size ? ` width="${size}" height="${size}"` : "";
    const fn = TOY_ICON[id];
    return `<svg viewBox="0 0 100 100"${dim} xmlns="http://www.w3.org/2000/svg">${fn ? fn() : ""}</svg>`;
  }
  const TOYS = [
    { id: "carrot", name: "Carrot", cost: 25 },
    { id: "ball", name: "Play Ball", cost: 40 },
    { id: "flowerpatch", name: "Flower Patch", cost: 60 },
    { id: "hay", name: "Hay Bale", cost: 70 },
    { id: "tunnel", name: "Tunnel", cost: 110 },
    { id: "house", name: "Bunny House", cost: 160 },
  ];
  const TOY_BY_ID = Object.fromEntries(TOYS.map((t) => [t.id, t]));

  window.BUNNIES = {
    CATALOG, RARITY, ACCESSORIES, ACC_BY_ID, TOYS, TOY_BY_ID, byId, byRarity, render, accessorySwatch, toySwatch,
    sleeping(size) {
      const px = size || 150;
      return `<img src="${BASE}sleeping.png" width="${px}" height="${px}" alt="sleeping bunny" style="object-fit:contain;display:block" />`;
    },
  };
})();
