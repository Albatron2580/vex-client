package net.vexclient.mod.module.impl;

import net.minecraft.client.Minecraft;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.vexclient.mod.module.Module;

import java.util.UUID;

/**
 * Creative-style flight in survival. Singleplayer only: it asks the built-in (integrated) server to allow
 * flying for you, the same switch creative mode uses. It does nothing on multiplayer servers.
 */
public final class FlightModule extends Module {
    private boolean granted;

    public FlightModule() { super("flight", "Flight", "Fly in survival (double-tap jump). Only works in singleplayer or a LAN world you host.", Category.CHEATS, true); }

    private static void setMayFly(Minecraft mc, boolean on) {
        MinecraftServer server = mc.getSingleplayerServer();
        if (server == null || mc.player == null) return;
        UUID id = mc.player.getUUID();
        server.execute(() -> {
            ServerPlayer sp = server.getPlayerList().getPlayer(id);
            if (sp == null) return;
            if (!on && (sp.isCreative() || sp.isSpectator())) return; // leave creative/spectator flight alone
            sp.getAbilities().mayfly = on;
            if (!on) sp.getAbilities().flying = false;
            sp.onUpdateAbilities();
        });
    }

    @Override public void tick(Minecraft mc) {
        boolean allowed = allowedHere() && mc.player != null;
        if (allowed && !granted) { setMayFly(mc, true); granted = true; }
        if (!allowed) granted = false;
    }

    @Override protected void onDisable() {
        Minecraft mc = Minecraft.getInstance();
        if (granted) setMayFly(mc, false);
        granted = false;
    }
}
