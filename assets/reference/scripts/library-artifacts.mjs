/**
 * XR Guild Library: shelf artifacts and the XR Guild Members book shelf.
 * Small, lightweight procedural objects for the empty shelf spaces, evoking the history of making
 * XR media: semi-transparent platonic-solid holograms, shiny metal puzzles, stereoscopes and
 * stereo cards, a magic lantern, zoetrope and praxinoscope, 1940s box, rangefinder and stereo
 * cameras, a View-Master style reel viewer, a volumetric capture ring, a 360 cinema camera,
 * a laptop and phone, haptic gloves and a controller, plus book sets labelled with Guild Library
 * categories and the XR Guild Members shelf with a gilt plaque.
 * All static pieces are merged per material (about a dozen draw calls); the five holograms turn
 * slowly. Place the item at the library centre, no rotation. Visual only, nothing stored or sent.
 */
const DEG = Math.PI / 180;

// [bookcase angle, shelf top y, tangential offset (m), type, options]
const LAYOUT = [
    [300, 0.96, -0.85, "lantern"], [300, 0.96, -0.3, "zoetrope"],
    [300, 1.60, -0.85, "stereoscope"], [300, 1.60, -0.3, "viewmaster"],
    [300, 2.24, -0.9, "holo", { solid: "tetra" }], [300, 2.24, -0.5, "holo", { solid: "cube" }], [300, 2.24, -0.05, "rings"],
    [300, 0.32, 0.55, "gloves"],
    [300, 2.88, 0.3, "books", { set: 0 }],
    [60, 0.96, 0.35, "boxcamera"], [60, 0.96, 0.85, "stereocamera"],
    [60, 1.60, 0.45, "laptop"], [60, 1.60, 1.0, "phone"],
    [60, 2.24, 0.15, "holo", { solid: "octa" }], [60, 2.24, 0.75, "burr"],
    [60, 0.32, 0.55, "cam360"],
    [60, 2.88, -0.9, "books", { set: 1 }],
    [150, 0.96, 0.35, "praxinoscope"], [150, 0.96, 0.95, "holo", { solid: "dodeca" }],
    [150, 1.60, -0.95, "cam360"], [150, 1.60, -0.5, "rangefinder"],
    [150, 2.24, -0.95, "glove"], [150, 2.24, -0.45, "controller"],
    [150, 2.88, 0.5, "books", { set: 2 }],
    [210, 0.96, 0.4, "stereocards"], [210, 0.96, 0.95, "brewster"],
    [210, 1.60, -0.85, "volumetric"],
    [210, 2.24, -0.95, "holo", { solid: "icosa" }], [210, 2.24, -0.45, "orbpuzzle"],
    [210, 2.88, -0.95, "books", { set: 3 }],
    [240, 0.96, -0.85, "crt"], [240, 0.96, -0.35, "stereocamera"],
    [240, 1.60, -0.9, "boxcamera"], [240, 1.60, -0.4, "viewmaster"],
    [240, 2.24, -0.85, "books", { set: 4 }],
    [330, 2.88, 0.45, "books", { set: 5 }],
    [30, 2.88, -0.85, "books", { set: 6 }],
    [0, 2.88, 0.05, "members"],
];

// Guild Library categories (library.xrguild.org) used on the general book sets
const CATS = ["AI Ethics", "Peer-Reviewed Immersive Tech", "Ethical Responsibility", "XR Industry News & Sources",
    "Neurotech & Brain Tech", "Mind Control & Privacy at Work", "Physiological & Psychological Effects",
    "Privacy & Policy", "Security & Safety", "Children", "Consent", "Eye Tracking", "Avatars", "Governance",
    "Harassment", "Mental Health", "Standards", "Neural Data", "Deepfakes"];

// XR Guild member books (titles and authors as supplied by the Guild)
const MEMBERS = [
    { t: "Promptcraft", a: "Evo Heyning", c: "#1d5c58" },
    { t: "Digital Wellbeing", a: "Caitlin Krause", c: "#6b3a5e" },
    { t: "Reality Check", a: "Jeremy Dalton", c: "#24364f" },
    { t: "Spatial Design", a: "Dominique Wu", c: "#4a4a2a" },
    { t: "Making a Metaverse That Matters", a: "Wagner James Au", c: "#5a2a22" },
    { t: "Our Next Reality", a: "Alvin Graylin & Louis Rosenberg", c: "#1e2d5a" },
    { t: "Inclusive Design for a Digital World", a: "Regine Gilbert", c: "#2f4a2a" },
];

export class LibraryArtifacts extends ArrivalScript {
    static scriptName = "libraryArtifacts";
    static description = "Small XR-history artifacts, holograms and book sets for the library shelves, plus the XR Guild Members shelf.";

    shelfRadius = 6.2;
    holoSpin = 18;
    static properties = {
        shelfRadius: { title: "Shelf depth from centre (m)", min: 5, max: 7, step: 0.01 },
        holoSpin: { title: "Hologram spin (deg/s)", min: 0, max: 90, step: 1 },
    };

    _root = null; _res = []; _holos = [];

    initialize() { this._build(); }
    onPropertyChanged() { this._teardown(); this._build(); }
    destroy() { this._teardown(); }
    update(dt) { for (const h of this._holos) h.rotateLocal(0, this.holoSpin * dt, 0); }

    // ---------- merged geometry ----------
    _B(k) { return this._bufs[k] || (this._bufs[k] = { p: [], n: [], uv: [], i: [] }); }
    _push(k, m, verts, idx) {
        const B = this._B(k), base = B.p.length / 3, v = new pc.Vec3(), n = new pc.Vec3();
        for (const [px, py, pz, nx, ny, nz, u, w] of verts) {
            m.transformPoint(v.set(px, py, pz), v); m.transformVector(n.set(nx, ny, nz), n).normalize();
            B.p.push(v.x, v.y, v.z); B.n.push(n.x, n.y, n.z); B.uv.push(u, w);
        }
        for (const x of idx) B.i.push(base + x);
    }
    _box(k, m, hx, hy, hz, uv) {
        const F = [[[1, 0, 0], [0, 0, -1], [0, 1, 0], hx, hz, hy], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hx, hz, hy], [[0, 1, 0], [1, 0, 0], [0, 0, -1], hy, hx, hz],
            [[0, -1, 0], [1, 0, 0], [0, 0, 1], hy, hx, hz], [[0, 0, 1], [1, 0, 0], [0, 1, 0], hz, hx, hy], [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hz, hx, hy]];
        F.forEach(([N, U, V, dn, du, dv], fi) => {
            const r = (uv && uv[fi]) || [0, 0, 1, 1], verts = [];
            for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
                verts.push([N[0] * dn + U[0] * du * su + V[0] * dv * sv, N[1] * dn + U[1] * du * su + V[1] * dv * sv, N[2] * dn + U[2] * du * su + V[2] * dv * sv, ...N, r[0] + (su + 1) / 2 * (r[2] - r[0]), r[3] - (sv + 1) / 2 * (r[3] - r[1])]);
            this._push(k, m, verts, [0, 1, 2, 0, 2, 3]);
        });
    }
    _cyl(k, m, r, h, seg = 16, r2 = r, caps = true) {
        const verts = [], idx = [];
        for (let s = 0; s <= seg; s++) {
            const a = s / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
            verts.push([c * r, -h / 2, sn * r, c, 0, sn, s / seg, 1], [c * r2, h / 2, sn * r2, c, 0, sn, s / seg, 0]);
            if (s < seg) { const b = s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        }
        if (caps) for (const [y, rr, ny] of [[h / 2, r2, 1], [-h / 2, r, -1]]) {
            const c0 = verts.length; verts.push([0, y, 0, 0, ny, 0, 0.5, 0.5]);
            for (let s = 0; s <= seg; s++) { const a = s / seg * Math.PI * 2; verts.push([Math.cos(a) * rr, y, Math.sin(a) * rr, 0, ny, 0, 0.5, 0.5]); }
            for (let s = 0; s < seg; s++) ny > 0 ? idx.push(c0, c0 + s + 2, c0 + s + 1) : idx.push(c0, c0 + s + 1, c0 + s + 2);
        }
        this._push(k, m, verts, idx);
    }
    _sph(k, m, r, seg = 12) {
        const verts = [], idx = [];
        for (let a = 0; a <= seg; a++) for (let b = 0; b <= seg; b++) {
            const th = a / seg * Math.PI, ph = b / seg * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
            verts.push([x * r, y * r, z * r, x, y, z, b / seg, a / seg]);
        }
        for (let a = 0; a < seg; a++) for (let b = 0; b < seg; b++) { const i0 = a * (seg + 1) + b, i1 = i0 + seg + 1; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
        this._push(k, m, verts, idx);
    }
    _tor(k, m, R, r, seg = 24, side = 8) {
        const verts = [], idx = [];
        for (let a = 0; a <= seg; a++) for (let b = 0; b <= side; b++) {
            const u = a / seg * Math.PI * 2, v = b / side * Math.PI * 2, cx = Math.cos(u), cz = Math.sin(u);
            verts.push([(R + r * Math.cos(v)) * cx, r * Math.sin(v), (R + r * Math.cos(v)) * cz, Math.cos(v) * cx, Math.sin(v), Math.cos(v) * cz, a / seg, b / side]);
        }
        for (let a = 0; a < seg; a++) for (let b = 0; b < side; b++) { const i0 = a * (side + 1) + b, i1 = i0 + side + 1; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
        this._push(k, m, verts, idx);
    }
    _T(M, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
        const l = new pc.Mat4().setTRS(new pc.Vec3(x, y, z), new pc.Quat().setFromEulerAngles(rx, ry, rz), new pc.Vec3(s, s, s));
        return new pc.Mat4().mul2(M, l);
    }

    // ---------- canvas atlas for book spines and the plaque ----------
    _atlas() {
        const c = document.createElement("canvas"); c.width = 2048; c.height = 1024;
        const g = c.getContext("2d");
        g.fillStyle = "#3b2a1a"; g.fillRect(0, 0, 2048, 1024);
        const spine = (i, title, author, col) => {
            const x = (i % 32) * 64, y = Math.floor(i / 32) * 512;
            g.fillStyle = col; g.fillRect(x, y, 64, 512);
            g.fillStyle = "#d8ae5a"; g.fillRect(x, y + 18, 64, 4); g.fillRect(x, y + 490, 64, 4);
            g.save(); g.translate(x + 32, y + 256); g.rotate(Math.PI / 2);
            g.fillStyle = "#f1d58f"; g.textAlign = "center"; g.textBaseline = "middle";
            let fs = 30; g.font = `600 ${fs}px Georgia, serif`;
            while (g.measureText(title).width > 440 && fs > 14) { fs -= 2; g.font = `600 ${fs}px Georgia, serif`; }
            g.fillText(title, 0, author ? -9 : 0);
            if (author) { g.font = "17px Georgia, serif"; g.fillStyle = "#e8dcc0"; g.fillText(author, 0, 17); }
            g.restore();
        };
        MEMBERS.forEach((b, i) => spine(i, b.t, b.a, b.c));
        const pal = ["#2b3d4f", "#4f2b2b", "#2b4f3a", "#4a3b22", "#3a2b4f", "#1f3f45", "#52402a", "#33422a"];
        CATS.forEach((t, i) => spine(8 + i, t, "XR Guild Library", pal[i % pal.length]));
        // plaque at row 1, right half
        g.fillStyle = "#c99a3e"; g.fillRect(1024, 512, 1024, 256);
        g.strokeStyle = "#7a5a1e"; g.lineWidth = 10; g.strokeRect(1040, 528, 992, 224);
        g.fillStyle = "#3a2a10"; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = "600 92px Georgia, serif"; g.fillText("XR Guild Members", 1536, 640);
        // solid swatches (paper, card)
        g.fillStyle = "#efe6d0"; g.fillRect(1024, 768, 256, 256);
        g.fillStyle = "#8a6b4a"; g.fillRect(1280, 768, 256, 256);
        const t = new pc.Texture(this.app.graphicsDevice, { width: 2048, height: 1024, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
        t.setSource(c); this._res.push(t); return t;
    }
    _spineUV(i) { const x = (i % 32) * 64, y = Math.floor(i / 32) * 512; return [x / 2048, y / 1024, (x + 64) / 2048, (y + 512) / 1024]; }

    // ---------- items (origin on the shelf, +Z faces the room) ----------
    _item(M, type, o = {}) {
        const T = (...a) => this._T(M, ...a);
        switch (type) {
            case "lantern": // magic lantern, c. 1900
                this._box("brass", T(0, 0.01, 0), 0.09, 0.01, 0.07);
                this._box("darkmetal", T(0, 0.1, 0), 0.07, 0.08, 0.06);
                this._cyl("brass", T(0, 0.11, 0.1, 90, 0, 0), 0.025, 0.1, 14);
                this._cyl("lens", T(0, 0.11, 0.152, 90, 0, 0), 0.022, 0.006, 14);
                this._cyl("darkmetal", T(0, 0.21, 0), 0.02, 0.06, 10); this._cyl("brass", T(0, 0.245, 0), 0.03, 0.01, 10, 0.01);
                break;
            case "zoetrope":
                this._cyl("wood", T(0, 0.01, 0), 0.05, 0.02, 16);
                this._cyl("brass", T(0, 0.07, 0), 0.008, 0.1, 8);
                for (let s = 0; s < 12; s++) { const a = s * 30; this._box("darkmetal", T(0, 0.15, 0, 0, a, 0).mul(new pc.Mat4().setTranslate(0, 0, 0.1)), 0.02, 0.04, 0.003); }
                this._cyl("darkmetal", T(0, 0.115, 0), 0.1, 0.006, 24);
                break;
            case "praxinoscope":
                this._cyl("wood", T(0, 0.015, 0), 0.09, 0.03, 20);
                this._cyl("paper", T(0, 0.06, 0), 0.085, 0.06, 20, 0.085, false);
                this._cyl("mirror", T(0, 0.06, 0), 0.04, 0.06, 12, 0.04);
                this._cyl("brass", T(0, 0.1, 0), 0.006, 0.08, 8);
                break;
            case "stereoscope": // Holmes hand stereoscope
                this._box("wood", T(0, 0.12, -0.02), 0.012, 0.004, 0.12);
                this._box("wood", T(0, 0.12, 0.1), 0.06, 0.03, 0.012);
                this._box("darkmetal", T(0, 0.135, 0.115), 0.075, 0.025, 0.02);
                for (const x of [-0.03, 0.03]) this._cyl("lens", T(x, 0.135, 0.137, 90, 0, 0), 0.016, 0.004, 12);
                this._box("card", T(0, 0.14, -0.11), 0.085, 0.045, 0.002);
                this._cyl("wood", T(0, 0.06, 0.05), 0.01, 0.12, 8);
                this._box("wood", T(0, 0.005, 0.05), 0.04, 0.005, 0.04);
                break;
            case "brewster": // Brewster box stereoscope
                this._box("wood", T(0, 0.07, 0, -12, 0, 0), 0.07, 0.06, 0.09);
                for (const x of [-0.03, 0.03]) this._cyl("brass", T(x, 0.14, 0.03, -12, 0, 0), 0.014, 0.03, 12);
                break;
            case "stereocards":
                for (let k = 0; k < 6; k++) this._box("card", T(0, 0.004 + k * 0.004, 0, 0, k * 4 - 10, 0), 0.085, 0.002, 0.045);
                this._box("card", T(0, 0.06, -0.03, -15, 0, 0), 0.085, 0.045, 0.002);
                break;
            case "viewmaster":
                this._box("bakelite", T(0, 0.06, 0), 0.06, 0.045, 0.035);
                for (const x of [-0.025, 0.025]) this._cyl("lens", T(x, 0.07, 0.036, 90, 0, 0), 0.01, 0.006, 10);
                this._cyl("card", T(0.12, 0.003, 0.02), 0.045, 0.004, 20);
                this._cyl("darkmetal", T(0.12, 0.006, 0.02), 0.008, 0.004, 10);
                break;
            case "boxcamera": // 1940s box camera
                this._box("leather", T(0, 0.07, 0), 0.05, 0.07, 0.07);
                this._cyl("chrome", T(0, 0.08, 0.075, 90, 0, 0), 0.02, 0.012, 14); this._cyl("lens", T(0, 0.08, 0.082, 90, 0, 0), 0.015, 0.003, 12);
                this._box("chrome", T(0, 0.145, 0), 0.03, 0.005, 0.02);
                break;
            case "rangefinder":
                this._box("leather", T(0, 0.045, 0), 0.07, 0.035, 0.02);
                this._box("chrome", T(0, 0.085, 0), 0.07, 0.006, 0.021);
                this._cyl("chrome", T(0, 0.045, 0.035, 90, 0, 0), 0.022, 0.03, 16); this._cyl("lens", T(0, 0.045, 0.051, 90, 0, 0), 0.017, 0.003, 14);
                for (const x of [-0.045, 0.045]) this._box("lens", T(x, 0.07, 0.022), 0.008, 0.006, 0.002);
                break;
            case "stereocamera": // 1940s stereo camera with twin lenses
                this._box("leather", T(0, 0.05, 0), 0.08, 0.035, 0.025);
                this._box("chrome", T(0, 0.09, 0), 0.08, 0.006, 0.026);
                for (const x of [-0.035, 0.035]) { this._cyl("chrome", T(x, 0.05, 0.035, 90, 0, 0), 0.015, 0.022, 14); this._cyl("lens", T(x, 0.05, 0.047, 90, 0, 0), 0.012, 0.003, 12); }
                this._cyl("chrome", T(0, 0.06, 0.03, 90, 0, 0), 0.009, 0.012, 10);
                break;
            case "volumetric": // volumetric capture ring on a stand
                this._cyl("darkmetal", T(0, 0.01, 0), 0.07, 0.02, 16);
                this._tor("chrome", T(0, 0.2, 0), 0.13, 0.006, 32, 6);
                for (let s = 0; s < 8; s++) {
                    const a = s * 45, m = T(0, 0.2, 0, 0, a, 0).mul(new pc.Mat4().setTranslate(0, 0, 0.13));
                    this._box("darkmetal", m, 0.012, 0.01, 0.012); this._cyl("lens", new pc.Mat4().mul2(m, new pc.Mat4().setTRS(new pc.Vec3(0, 0, -0.014), new pc.Quat().setFromEulerAngles(90, 0, 0), pc.Vec3.ONE)), 0.006, 0.004, 8);
                }
                for (let s = 0; s < 3; s++) { const a = s * 120; this._cyl("chrome", T(0, 0.105, 0, 0, a, 0).mul(new pc.Mat4().setTRS(new pc.Vec3(0, 0, 0.065), new pc.Quat().setFromEulerAngles(30, 0, 0), pc.Vec3.ONE)), 0.004, 0.2, 6); }
                this._sph("holoSolid", T(0, 0.2, 0), 0.035, 10);
                break;
            case "cam360": // 360 cinema camera: sphere of lenses on a short rod
                this._cyl("darkmetal", T(0, 0.01, 0), 0.04, 0.02, 14);
                this._cyl("darkmetal", T(0, 0.08, 0), 0.007, 0.13, 8);
                this._sph("darkmetal", T(0, 0.19, 0), 0.055, 14);
                for (let s = 0; s < 6; s++) { const m = T(0, 0.19, 0, 0, s * 60, 0).mul(new pc.Mat4().setTRS(new pc.Vec3(0, 0, 0.05), new pc.Quat().setFromEulerAngles(90, 0, 0), pc.Vec3.ONE)); this._cyl("lens", m, 0.016, 0.014, 12); }
                this._cyl("lens", T(0, 0.248, 0), 0.016, 0.012, 12);
                break;
            case "laptop":
                this._box("aluminium", T(0, 0.006, 0), 0.15, 0.006, 0.1);
                this._box("darkmetal", T(0, 0.0125, 0.02), 0.13, 0.0008, 0.05);
                this._box("aluminium", T(0, 0.1, -0.12, -12, 0, 0), 0.15, 0.095, 0.005);
                this._box("screen", T(0, 0.1, -0.114, -12, 0, 0), 0.138, 0.084, 0.0008);
                break;
            case "phone":
                this._box("darkmetal", T(0, 0.07, -0.01, -14, 0, 0), 0.036, 0.075, 0.004);
                this._box("screen", T(0, 0.07, -0.0055, -14, 0, 0), 0.033, 0.07, 0.0006);
                this._box("aluminium", T(0, 0.01, 0.01), 0.04, 0.01, 0.02);
                break;
            case "glove":
            case "gloves": {
                const one = (dx, ry) => {
                    const G = (...a) => this._T(new pc.Mat4().mul2(M, new pc.Mat4().setTRS(new pc.Vec3(dx, 0, 0), new pc.Quat().setFromEulerAngles(0, ry, 0), pc.Vec3.ONE)), ...a);
                    this._box("glove", G(0, 0.02, 0), 0.045, 0.018, 0.055);
                    [-0.03, -0.01, 0.01, 0.03].forEach((x, f) => this._cyl("glove", G(x, 0.025, 0.08 + (f === 1 || f === 2 ? 0.01 : 0), 90, 0, 0), 0.009, 0.06, 8));
                    this._cyl("glove", G(0.055, 0.02, 0.02, 90, 0, -40), 0.01, 0.05, 8);
                    for (const x of [-0.03, -0.01, 0.01, 0.03]) this._box("chrome", G(x, 0.035, 0.06), 0.006, 0.004, 0.012);
                    this._box("darkmetal", G(0, 0.042, -0.01), 0.03, 0.006, 0.025);
                    this._cyl("cable", G(0, 0.02, -0.09, 90, 0, 0), 0.004, 0.08, 6);
                };
                if (type === "gloves") { one(-0.08, 10); one(0.08, -10); } else one(0, 0);
                break;
            }
            case "controller":
                this._cyl("darkmetal", T(0, 0.05, 0, 20, 0, 0), 0.018, 0.1, 12);
                this._tor("darkmetal", T(0, 0.12, 0.02, 70, 0, 0), 0.045, 0.006, 24, 6);
                this._sph("chrome", T(0, 0.1, 0.015), 0.008, 8);
                break;
            case "rings": // interlocking metal ring puzzle
                this._cyl("darkmetal", T(0, 0.01, 0), 0.05, 0.02, 14);
                this._tor("chrome", T(0, 0.1, 0, 90, 0, 0), 0.05, 0.007, 28, 8);
                this._tor("gold", T(0, 0.1, 0, 90, 60, 0), 0.05, 0.007, 28, 8);
                this._tor("chrome", T(0, 0.1, 0, 90, 120, 0), 0.05, 0.007, 28, 8);
                break;
            case "burr": // six-piece metal burr puzzle
                this._box("chrome", T(0, 0.055, 0), 0.06, 0.012, 0.012); this._box("gold", T(0, 0.055, 0), 0.012, 0.06, 0.012); this._box("chrome", T(0, 0.055, 0), 0.012, 0.012, 0.06);
                this._box("gold", T(0.02, 0.055, 0.02), 0.012, 0.012, 0.055); this._box("chrome", T(-0.02, 0.075, 0), 0.055, 0.012, 0.012); this._box("gold", T(0, 0.035, -0.02), 0.012, 0.055, 0.012);
                break;
            case "orbpuzzle": // brass cage puzzle sphere
                this._cyl("darkmetal", T(0, 0.01, 0), 0.04, 0.02, 14);
                for (let s = 0; s < 4; s++) this._tor("gold", T(0, 0.09, 0, 90, s * 45, 0), 0.06, 0.004, 28, 6);
                this._tor("gold", T(0, 0.09, 0), 0.06, 0.004, 28, 6);
                this._sph("chrome", T(0, 0.09, 0), 0.02, 10);
                break;
            case "crt": // early cathode ray display on a wooden case
                this._box("wood", T(0, 0.06, 0), 0.08, 0.06, 0.08);
                this._cyl("lens", T(0, 0.13, 0.0, 90, 0, 0), 0.06, 0.02, 20);
                this._cyl("screen", T(0, 0.13, 0.081, 90, 0, 0), 0.05, 0.002, 20);
                this._cyl("lens", T(0, 0.13, -0.06, 90, 0, 0), 0.05, 0.1, 16, 0.015);
                for (const x of [-0.05, 0.05]) this._cyl("brass", T(x, 0.03, 0.082, 90, 0, 0), 0.008, 0.01, 10);
                break;
            case "books": {
                const n = 9, base = (o.set * 3) % CATS.length;
                let x = -0.22;
                for (let k = 0; k < n; k++) {
                    const ci = (base + k) % CATS.length, w = 0.022 + ((k * 7) % 4) * 0.005, h = 0.2 + ((k * 5) % 5) * 0.015, d = 0.15;
                    const sp = this._spineUV(8 + ci), cover = [1280 / 2048, 768 / 1024, 1536 / 2048, 1];
                    this._box("books", T(x + w / 2, h / 2, 0), w / 2, h / 2, d / 2, [cover, cover, [1024 / 2048, 768 / 1024, 1280 / 2048, 1], cover, sp, cover]);
                    x += w + 0.002;
                }
                break;
            }
            case "members": {
                let x = 0;
                MEMBERS.forEach((b, k) => {
                    const w = 0.04, h = 0.25 + (k % 3) * 0.012, d = 0.17;
                    const sp = this._spineUV(k), cover = [1280 / 2048, 768 / 1024, 1536 / 2048, 1];
                    this._box("books", T(x + w / 2, h / 2, 0.02), w / 2, h / 2, d / 2, [cover, cover, [1024 / 2048, 768 / 1024, 1280 / 2048, 1], cover, sp, cover]);
                    x += w + 0.004;
                });
                this._box("gold", T(x + 0.03, 0.1, 0.02), 0.004, 0.1, 0.07); // bookend
                // plaque on a small gilt stand in front of the books
                const pl = [1024 / 2048, 512 / 1024, 1, 768 / 1024], gold = [1280 / 2048, 768 / 1024, 1536 / 2048, 1];
                this._box("books", T(x / 2, 0.035, 0.155, -20, 0, 0), 0.13, 0.032, 0.004, [gold, gold, gold, gold, pl, gold]);
                this._box("gold", T(x / 2, 0.006, 0.15), 0.14, 0.006, 0.02);
                break;
            }
        }
    }

    _holo(M, solid) {
        // base stays merged; the solid is a separate slowly turning entity
        this._cyl("darkmetal", this._T(M, 0, 0.01, 0), 0.045, 0.02, 16);
        this._tor("holoSolid", this._T(M, 0, 0.022, 0), 0.035, 0.003, 24, 6);
        const V = {
            tetra: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]], cube: [], octa: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
        };
        const phi = (1 + Math.sqrt(5)) / 2;
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.cube.push([x, y, z]);
        V.icosa = []; for (const a of [-1, 1]) for (const b of [-1, 1]) { V.icosa.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]); }
        V.dodeca = [...V.cube]; for (const a of [-1, 1]) for (const b of [-1, 1]) { V.dodeca.push([0, a / phi, b * phi], [a / phi, b * phi, 0], [b * phi, 0, a / phi]); }
        const pts = V[solid].map((p) => { const l = Math.hypot(...p); return p.map((v) => v / l * 0.05); });
        // convex hull triangles by brute force (small point sets)
        const tris = [], P = pts.map((p) => new pc.Vec3(...p)), e = 1e-6;
        for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) for (let c = b + 1; c < P.length; c++) {
            const nrm = new pc.Vec3().cross(new pc.Vec3().sub2(P[b], P[a]), new pc.Vec3().sub2(P[c], P[a]));
            if (nrm.length() < e) continue;
            let pos = 0, neg = 0;
            for (let d = 0; d < P.length; d++) { const s = nrm.dot(new pc.Vec3().sub2(P[d], P[a])); if (s > e) pos++; else if (s < -e) neg++; }
            if (pos && neg) continue;
            if (pos) nrm.mulScalar(-1);
            tris.push([a, b, c, nrm.normalize()]);
        }
        const p = [], n = [], idx = [];
        for (const [a, b, c, nn] of tris) {
            const ab = new pc.Vec3().sub2(P[b], P[a]), ac = new pc.Vec3().sub2(P[c], P[a]), flip = new pc.Vec3().cross(ab, ac).dot(nn) < 0;
            for (const q of flip ? [a, c, b] : [a, b, c]) { p.push(P[q].x, P[q].y, P[q].z); n.push(nn.x, nn.y, nn.z); }
            idx.push(idx.length, idx.length + 1, idx.length + 2);
        }
        const mesh = new pc.Mesh(this.app.graphicsDevice); mesh.setPositions(p); mesh.setNormals(n); mesh.setIndices(idx); mesh.update(); this._res.push(mesh);
        const e1 = new pc.Entity("hologram-" + solid);
        e1.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, this._mats.holo)], castShadows: false });
        this._root.addChild(e1);
        const w = new pc.Vec3(); M.transformPoint(new pc.Vec3(0, 0.1, 0), w); e1.setPosition(w);
        e1.setEulerAngles(20, Math.random() * 360, 10);
        this._holos.push(e1);
    }

    _mat(o) {
        const m = new pc.StandardMaterial();
        m.diffuse = new pc.Color(...(o.c || [1, 1, 1])); m.useMetalness = true; m.metalness = o.metal ?? 0; m.gloss = o.gloss ?? 0.5;
        if (o.coat) { m.clearCoat = o.coat; m.clearCoatGloss = 0.9; }
        if (o.em) { m.emissive = new pc.Color(...o.em); m.emissiveIntensity = o.emi ?? 1; }
        if (o.map) { m.diffuseMap = o.map; }
        if (o.op != null) { m.blendType = o.add ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL; m.opacity = o.op; m.depthWrite = false; m.cull = pc.CULLFACE_NONE; }
        m.update(); this._res.push(m); return m;
    }

    _build() {
        this._root = new pc.Entity("library-artifacts"); this.entity.addChild(this._root);
        this._bufs = {}; this._holos = [];
        const atlas = this._atlas();
        this._mats = {
            brass: this._mat({ c: [0.8, 0.6, 0.28], metal: 1, gloss: 0.8 }), gold: this._mat({ c: [0.86, 0.66, 0.32], metal: 1, gloss: 0.88 }),
            chrome: this._mat({ c: [0.9, 0.9, 0.92], metal: 1, gloss: 0.93 }), aluminium: this._mat({ c: [0.75, 0.76, 0.78], metal: 1, gloss: 0.7 }),
            darkmetal: this._mat({ c: [0.08, 0.08, 0.09], metal: 0.6, gloss: 0.7 }), wood: this._mat({ c: [0.36, 0.2, 0.1], gloss: 0.55, coat: 0.6 }),
            leather: this._mat({ c: [0.06, 0.05, 0.05], gloss: 0.35 }), bakelite: this._mat({ c: [0.35, 0.12, 0.08], gloss: 0.8, coat: 0.8 }),
            lens: this._mat({ c: [0.02, 0.03, 0.05], metal: 0.3, gloss: 0.97, coat: 1 }), mirror: this._mat({ c: [0.95, 0.95, 0.95], metal: 1, gloss: 0.98 }),
            screen: this._mat({ c: [0, 0, 0], em: [0.25, 0.75, 0.85], emi: 0.9 }), card: this._mat({ c: [0.85, 0.8, 0.68], gloss: 0.2 }),
            paper: this._mat({ c: [0.92, 0.88, 0.78], gloss: 0.2 }), glove: this._mat({ c: [0.12, 0.13, 0.15], gloss: 0.3 }),
            cable: this._mat({ c: [0.05, 0.05, 0.05], gloss: 0.4 }), books: this._mat({ map: atlas, gloss: 0.3 }),
            holoSolid: this._mat({ c: [0.3, 0.9, 1], em: [0.3, 0.9, 1], emi: 1.2 }),
            holo: this._mat({ c: [0.2, 0.8, 1], em: [0.25, 0.85, 1], emi: 1.4, op: 0.38, add: true }),
        };
        const R = this.shelfRadius;
        for (const [ang, y, t, type, o] of LAYOUT) {
            const a = ang * DEG, c = Math.cos(a), s = Math.sin(a);
            const pos = new pc.Vec3(c * R - s * t, y, s * R + c * t);
            const yaw = Math.atan2(-c, -s) / DEG; // local +Z toward the room centre
            const M = new pc.Mat4().setTRS(pos, new pc.Quat().setFromEulerAngles(0, yaw, 0), pc.Vec3.ONE);
            if (type === "holo") this._holo(M, o.solid); else this._item(M, type, o || {});
        }
        for (const [k, B] of Object.entries(this._bufs)) {
            if (!B.p.length) continue;
            const mesh = new pc.Mesh(this.app.graphicsDevice);
            mesh.setPositions(B.p); mesh.setNormals(B.n); mesh.setUvs(0, B.uv); mesh.setIndices(B.i); mesh.update(); this._res.push(mesh);
            const e = new pc.Entity("artifacts-" + k);
            e.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, this._mats[k])], castShadows: false, receiveShadows: true });
            this._root.addChild(e);
        }
    }

    _teardown() {
        if (this._root) { this._root.destroy(); this._root = null; }
        this._res.forEach((r) => { try { r.destroy(); } catch (e) {} }); this._res = []; this._holos = [];
    }
}
