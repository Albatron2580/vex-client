package net.vexclient.mod.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.vexclient.mod.data.Friends;
import net.vexclient.mod.gui.HudEditorScreen;
import net.vexclient.mod.gui.VexMenuScreen;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;

/** Starts the real game, opens every Vex screen and saves screenshots (CI uploads them for review). */
public final class VexScreenshots implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext ctx) {
        ctx.waitForScreen(TitleScreen.class);
        ctx.waitTicks(40);
        ctx.takeScreenshot("01-title-screen");

        ctx.setScreen(() -> new VexMenuScreen(new TitleScreen()));
        ctx.waitTicks(10);
        ctx.takeScreenshot("02-menu-from-title");

        try (TestSingleplayerContext sp = ctx.worldBuilder().create()) {
            sp.getClientWorld().waitForChunksRender();
            ctx.runOnClient(mc -> {
                for (HudElement e : Hud.ELEMENTS) e.enabled = true;
                Friends.add("RaxMc");
            });
            ctx.waitTicks(20);
            ctx.takeScreenshot("03-ingame-hud");

            ctx.setScreen(() -> new PauseScreen(true));
            ctx.waitTicks(10);
            ctx.takeScreenshot("04-pause-menu");

            String[][] pages = {
                    {"0", "0", "05-settings-general"}, {"0", "1", "06-settings-waypoints"}, {"0", "2", "07-settings-friends"},
                    {"0", "3", "08-settings-controls"}, {"0", "4", "09-settings-performance"}, {"0", "5", "10-settings-mods"},
                    {"0", "6", "11-settings-cheats"}, {"1", "0", "12-display-layout"}, {"1", "1", "13-display-fps"},
                    {"1", "7", "14-display-waypoints"}, {"2", "0", "15-shaders"}};
            for (String[] p : pages) {
                ctx.runOnClient(mc -> VexMenuScreen.select(Integer.parseInt(p[0]), Integer.parseInt(p[1])));
                ctx.setScreen(() -> new VexMenuScreen(null));
                ctx.waitTicks(8);
                ctx.takeScreenshot(p[2]);
            }

            ctx.setScreen(() -> new HudEditorScreen(null));
            ctx.waitTicks(8);
            ctx.takeScreenshot("16-hud-editor");
            ctx.setScreen(() -> null);
        }
    }
}
