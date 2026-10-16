// Account: sign in with Microsoft, switch accounts, sign out.
(function () {
  'use strict';
  const V = window.V;
  const h = V.h;

  async function afterChange() {
    V.state.settings = await V.call('settings:get');
    await V.refreshAccounts();
    await V.refreshPlayer();
  }

  async function signIn(btn) {
    await V.busy(btn, async () => {
      V.setStatus('Waiting for Microsoft sign-in…');
      const r = await V.call('accounts:login');
      V.setStatus('');
      await afterChange();
      V.toast(`Signed in as ${r.name}`, 'ok');
    });
    V.setStatus('');
  }

  V.register({
    id: 'account',
    title: 'Account',
    icon: 'user',
    group: 'bottom',

    build(el) {
      this.host = h('div');
      el.append(this.host);
      V.on('accounts', () => { if (V.current === 'account') this.render(); });
      V.on('player', () => { if (V.current === 'account') this.render(); });
    },

    async show() { await V.refreshAccounts(); this.render(); },

    render() {
      const accounts = V.state.accounts;
      const list = h('div', { class: 'list' });
      if (!accounts.length) list.append(V.empty('No account signed in', 'Sign in with the Microsoft account that owns Minecraft: Java Edition.'));
      for (const a of accounts) {
        const head = h('canvas', { class: 'head', 'aria-hidden': 'true' });
        V.drawHead(head, a.active ? V.player.skin : null, 48);
        list.append(h('div', { class: 'row-item' + (a.active ? ' on' : '') },
          head,
          h('div', { class: 'grow' },
            h('div', { class: 'hit-title' }, h('strong', null, a.name), a.active ? V.badge('Active', 'accent') : null, a.needsLogin ? V.badge('Sign-in expired', 'warn') : null),
            h('small', { class: 'dim' }, `Minecraft: Java Edition · ${a.uuid.slice(0, 8)}…`)),
          h('div', { class: 'row' },
            a.needsLogin ? h('button', { class: 'btn sm primary', onClick: (e) => signIn(e.currentTarget) }, 'Sign in again') : null,
            !a.active && !a.needsLogin ? h('button', { class: 'btn sm primary', onClick: (e) => V.busy(e.currentTarget, async () => { await V.call('accounts:switch', a.uuid); await afterChange(); V.toast(`Switched to ${a.name}`, 'ok'); }) }, 'Switch to this account') : null,
            h('button', {
              class: 'btn sm danger',
              onClick: async () => {
                if (!(await V.confirm({ title: `Sign out ${a.name}?`, text: 'The saved sign-in is deleted from this PC. Your profiles, mods and worlds are not touched.', confirm: 'Sign out', danger: true }))) return;
                try { await V.call('accounts:signout', a.uuid); await afterChange(); V.toast('Signed out', 'ok'); } catch (e) { V.error(e); }
              },
            }, V.icon('logout'), 'Sign out'))));
      }
      this.host.replaceChildren(
        V.pageHeader('Account', 'You need a Microsoft account that owns Minecraft: Java Edition to play.',
          h('button', { class: 'btn primary', onClick: (e) => signIn(e.currentTarget) }, V.icon('plus'), accounts.length ? 'Add another account' : 'Sign in with Microsoft')),
        list,
        h('section', { class: 'card' },
          h('h3', null, 'How signing in works'),
          h('ul', { class: 'plain' },
            h('li', null, 'You sign in on Microsoft\'s own page. Vex Client never sees or stores your password.'),
            h('li', null, 'After that, Xbox Live and Minecraft checks run to confirm you own Minecraft: Java Edition. There is no way to play without owning it.'),
            h('li', null, V.state.secure
              ? 'Your sign-in token is encrypted with Windows (tied to your Windows user) before it is saved, and refreshed automatically.'
              : 'Secure storage is not available on this PC, so your sign-in is not saved. You will need to sign in again each time you open the launcher.'),
            h('li', null, 'You can add several accounts and switch between them. Signing out deletes the saved token.'))));
    },
  });
})();
