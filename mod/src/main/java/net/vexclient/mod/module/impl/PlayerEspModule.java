package net.vexclient.mod.module.impl;

import net.vexclient.mod.module.Module;

/** Other players get the glowing outline, visible through walls. Singleplayer / your own LAN world only. */
public final class PlayerEspModule extends Module {
    public PlayerEspModule() { super("player_esp", "Player ESP", "Outlines other players through walls. Only works in singleplayer or a LAN world you host.", Category.CHEATS, true); }
}
