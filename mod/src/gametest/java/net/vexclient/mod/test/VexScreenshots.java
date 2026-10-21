package net.vexclient.mod.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.vexclient.mod.VexConfig;
import net.vexclient.mod.data.Friends;
import net.vexclient.mod.gui.HudEditorScreen;
import net.vexclient.mod.gui.Ui;
import net.vexclient.mod.gui.VexMenuScreen;
import net.vexclient.mod.gui.VexRadialScreen;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;

/** Starts the real game, opens every VEX screen and saves screenshots (CI uploads them for review). */
public final class VexScreenshots implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext ctx) {
        ctx.waitForScreen(TitleScreen.class);
        ctx.waitTicks(40);
        ctx.takeScreenshot("01-title-screen");

        ctx.setScreen(() -> new VexRadialScreen(new TitleScreen()));
        ctx.waitTicks(15);
        ctx.takeScreenshot("02-radial-from-title");

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

            ctx.setScreen(() -> new VexRadialScreen(null));
            ctx.waitTicks(15);
            ctx.takeScreenshot("05-radial-ingame");

            ctx.runOnClient(mc -> VexRadialScreen.presetSearch = "zoom");
            ctx.setScreen(() -> new VexRadialScreen(null));
            ctx.waitTicks(10);
            ctx.takeScreenshot("06-radial-search");

            Object[][] pages = {
                    {VexMenuScreen.Page.HUD, 0, "07-hud"}, {VexMenuScreen.Page.UTILITY, 0, "08-utility-modules"},
                    {VexMenuScreen.Page.UTILITY, 1, "09-utility-combat"}, {VexMenuScreen.Page.UTILITY, 6, "10-utility-modmenu"},
                    {VexMenuScreen.Page.VISUALS, 0, "11-visuals"}, {VexMenuScreen.Page.VISUALS, 1, "12-shaders"},
                    {VexMenuScreen.Page.GUI, 0, "13-settings"}, {VexMenuScreen.Page.DESIGN, 0, "14-design"},
                    {VexMenuScreen.Page.ALL, 0, "15-every-module"}, {VexMenuScreen.Page.UTILITY, 4, "16-controls"}};
            for (Object[] p : pages) {
                ctx.setScreen(() -> new VexMenuScreen(new VexRadialScreen(null), null, (VexMenuScreen.Page) p[0], (Integer) p[1]));
                ctx.waitTicks(8);
                ctx.takeScreenshot((String) p[2]);
            }

            // other themes and GUI scale 3x
            ctx.runOnClient(mc -> { VexConfig.get().theme = "Aurora"; Ui.apply("Aurora"); });
            ctx.setScreen(() -> new VexRadialScreen(null));
            ctx.waitTicks(10);
            ctx.takeScreenshot("17-radial-aurora");
            ctx.runOnClient(mc -> { VexConfig.get().theme = "Sakura"; Ui.apply("Sakura"); VexConfig.get().guiScale = 3; });
            ctx.setScreen(() -> new VexMenuScreen(null, null, VexMenuScreen.Page.GUI, 0));
            ctx.waitTicks(8);
            ctx.takeScreenshot("18-gui-settings-scale3");
            ctx.runOnClient(mc -> VexConfig.get().guiScale = 0);

            ctx.setScreen(() -> new HudEditorScreen(null));
            ctx.waitTicks(8);
            ctx.takeScreenshot("19-hud-editor");
            ctx.setScreen(() -> null);
        }
    }
}
