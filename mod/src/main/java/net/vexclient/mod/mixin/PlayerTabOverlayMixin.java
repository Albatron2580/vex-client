package net.vexclient.mod.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.vexclient.mod.online.VexOnline;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Grey V in front of VEX players in the tab list. */
@Mixin(PlayerTabOverlay.class)
public abstract class PlayerTabOverlayMixin {
    @ModifyReturnValue(method = "getNameForDisplay", at = @At("RETURN"))
    private Component vexclient$badge(Component name, PlayerInfo info) {
        return VexOnline.badged(info.getProfile().id(), name);
    }
}
