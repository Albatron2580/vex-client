package net.vexclient.mod.mixin;

import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.vexclient.mod.VexClientMod;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PauseScreen.class)
public abstract class PauseScreenMixin extends Screen {
    protected PauseScreenMixin(Component title) { super(title); }

    @Inject(method = "init", at = @At("TAIL"))
    private void vexclient$button(CallbackInfo ci) {
        // only the full pause menu (not the small one shown with F3+Esc)
        if (this.children().size() > 2) VexClientMod.addSettingsButton(this, this.children(), this::addRenderableWidget, false);
    }
}
