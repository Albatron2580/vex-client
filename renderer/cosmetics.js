// Cosmetics: capes owned by your Minecraft account (visible to everyone) and local capes (launcher preview only).
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  // Active local cape as an image, for the Home preview.
  let localCache = null;
  V.getLocalCape = async () => {
    const name = V.state.settings.activeCape;
    if (!name) return null;
    if (localCache && localCache.name === name) return localCache.value;
    const list = await V.call('cape:list');
    const c = list.find((x) => x.name === name);
    if (!c) return null;
    const img = await V.loadImage(c.dataUrl);
    localCache = { name, value: { img, unit: V.capeUnit(img) } };
    return localCache.value;
  };
  V.on('capes', () => { localCache = null; });

  // Small picture of a cape's back panel
  function thumb(img) {
    const c = h('canvas', { class: 'cape-thumb', width: 40, height: 64, 'aria-hidden': 'true' });
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const u = V.capeUnit(img);
    ctx.drawImage(img, u, u, 10 * u, 16 * u, 0, 0, 40, 64);
    return c;
  }

  V.register({
    id: 'cosmetics',
    title: 'Cosmetics',
    icon: 'star',
    group: 'main',

    build(el) {
      this.back = true;
      this.preview = null; // { img, unit, label }
      this.canvas = h('canvas', { class: 'preview-canvas', role: 'img', 'aria-label': 'Cape preview' });
      this.previewLabel = h('p', { class: 'dim center' });
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
        h('button', { class: 'on', onClick: () => this.setBack(true) }, 'Back'),
        h('button', { onClick: () => this.setBack(false) }, 'Front'));
      this.seg = seg;
      this.mojangBox = h('div');
      this.localBox = h('div');
      el.append(
        V.pageHeader('Cosmetics', 'Preview capes and choose which one you wear.'),
        h('div', { class: 'cosmetics' },
          h('div', { class: 'card preview-card' }, seg, this.canvas, this.previewLabel,
            h('p', { class: 'hint center' }, 'Capes only show from the back.')),
          h('div', { class: 'cosmetics-main' },
            h('section', { class: 'card' },
              h('div', { class: 'card-top' }, h('h3', null, 'Your Minecraft capes'), V.badge('Visible to everyone', 'ok')),
              h('p', { class: 'dim' }, 'Capes Mojang has given your account, for example from events. Other players see the one you equip here.'),
              this.mojangBox),
            h('section', { class: 'card' },
              h('div', { class: 'card-top' }, h('h3', null, 'Local capes'), V.badge('This launcher only', 'warn')),
              h('div', { class: 'banner' }, V.icon('alert'), h('span', null, 'A local cape is shown in this launcher\'s preview (here and on Home). Minecraft cannot load a cape from a file, and other players cannot see it. Showing one in the game needs a cosmetics mod, which Vex Client does not include yet.')),
              this.localBox))));
      V.on('player', () => { if (V.current === 'cosmetics') this.drawPreview(); });
    },

    setBack(b) {
      this.back = b;
      V.$$('button', this.seg).forEach((x, i) => x.classList.toggle('on', (i === 0) === b));
      this.drawPreview();
    },

    drawPreview() {
      const p = V.player;
      V.drawPlayer(this.canvas, { skin: p.skin, slim: p.slim, back: this.back, cape: this.preview && this.preview.img, capeUnit: this.preview && this.preview.unit, scale: 9 });
      this.previewLabel.textContent = this.preview ? `Previewing: ${this.preview.label}` : 'Pick a cape to preview it.';
    },

    async setPreview(img, label) {
      this.preview = { img, unit: V.capeUnit(img), label };
      this.drawPreview();
    },

    async show() {
      this.drawPreview();
      await Promise.all([this.loadMojang(), this.loadLocal()]);
    },

    async loadMojang() {
      const acc = V.state.active;
      if (!acc) {
        this.mojangBox.replaceChildren(V.empty('Not signed in', 'Sign in on the Account page to see the capes your account owns.', h('button', { class: 'btn primary', onClick: () => V.go('account') }, 'Go to Account')));
        return;
      }
      await V.load(this.mojangBox, async () => {
        const capes = await V.call('cape:mojang', acc.uuid);
        if (!capes.length) return V.empty('No capes on this account', 'Mojang gives out capes for things like events and anniversaries. None are on this account yet.');
        const wrap = h('div', { class: 'grid capes' });
        for (const c of capes) {
          const canvas = h('div', { class: 'cape-slot' });
          V.loadImage(c.url).then((img) => {
            canvas.replaceChildren(thumb(img));
            if (c.active && !this.preview) this.setPreview(img, c.alias);
            canvas.addEventListener('click', () => this.setPreview(img, c.alias));
          }).catch(() => canvas.replaceChildren(h('span', { class: 'dim small' }, 'No preview')));
          wrap.append(h('div', { class: 'cape-card' + (c.active ? ' on' : '') }, canvas, h('strong', null, c.alias), c.active ? V.badge('Equipped', 'ok') : null,
            h('button', {
              class: 'btn sm' + (c.active ? '' : ' primary'),
              onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('cape:mojangSet', acc.uuid, c.active ? null : c.id); V.toast(c.active ? 'Cape hidden' : `${c.alias} equipped. It can take a minute to show for other players.`, 'ok'); await this.loadMojang(); }),
            }, c.active ? 'Hide cape' : 'Equip')));
        }
        return wrap;
      });
    },

    async loadLocal() {
      await V.load(this.localBox, async () => {
        const capes = await V.call('cape:list');
        const wrap = h('div', null,
          h('div', { class: 'toolbar' },
            h('span', { class: 'dim' }, 'PNG images: 64×32 (or a multiple like 128×64), 22×17 or 46×22 pixels.'),
            h('span', { class: 'grow' }),
            h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { const r = await V.call('cape:import'); if (r.length) { V.emit('capes'); V.toast(`Imported ${r.join(', ')}`, 'ok'); await this.loadLocal(); } }) }, V.icon('plus'), 'Import cape'),
            h('button', { class: 'btn sm', onClick: () => V.call('shell:folder', 'capes').catch(V.error) }, V.icon('folder'), 'Open folder')));
        if (!capes.length) { wrap.append(V.empty('No local capes yet', 'Import a PNG to preview it on your skin.')); return wrap; }
        const grid = h('div', { class: 'grid capes' });
        for (const c of capes) {
          const slot = h('div', { class: 'cape-slot' });
          V.loadImage(c.dataUrl).then((img) => {
            slot.replaceChildren(thumb(img));
            slot.addEventListener('click', () => this.setPreview(img, c.name.replace(/\.png$/i, '')));
            if (c.active && !this.preview) this.setPreview(img, c.name.replace(/\.png$/i, ''));
          });
          grid.append(h('div', { class: 'cape-card' + (c.active ? ' on' : '') }, slot,
            h('strong', { title: c.name }, c.name.replace(/\.png$/i, '')),
            h('small', { class: 'dim' }, `${c.width}×${c.height}`),
            c.active ? V.badge('In use here', 'accent') : null,
            h('div', { class: 'row' },
              h('button', { class: 'btn sm' + (c.active ? '' : ' primary'), onClick: async () => { try { await V.call('cape:select', c.active ? '' : c.name); await V.saveSettings({}); V.state.settings.activeCape = c.active ? '' : c.name; V.emit('capes'); await this.loadLocal(); } catch (e) { V.error(e); } } }, c.active ? 'Stop using' : 'Use'),
              h('button', {
                class: 'icon-btn danger', 'aria-label': `Delete ${c.name}`, title: 'Delete',
                onClick: async () => {
                  if (!(await V.confirm({ title: `Delete ${c.name}?`, text: 'The imported image is removed from the launcher. Your original file is not touched.', confirm: 'Delete', danger: true }))) return;
                  try { await V.call('cape:remove', c.name); if (V.state.settings.activeCape === c.name) V.state.settings.activeCape = ''; V.emit('capes'); await this.loadLocal(); } catch (e) { V.error(e); }
                },
              }, V.icon('trash')))));
        }
        wrap.append(grid);
        return wrap;
      });
    },
  });
})();
