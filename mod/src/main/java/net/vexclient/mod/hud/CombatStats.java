package net.vexclient.mod.hud;

import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayDeque;

/** Numbers for the combat HUD: clicks per second, the reach of your last hit and your combo. Reads only your own input. */
public final class CombatStats {
    private CombatStats() {}

    private static final ArrayDeque<Long> left = new ArrayDeque<>(), right = new ArrayDeque<>();
    private static boolean wasL, wasR;
    public static double lastReach = -1;
    public static long lastHitAt;
    public static int combo;
    private static int lastHurt;

    public static void init() {
        AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
            if (level instanceof ClientLevel && player == Minecraft.getInstance().player) {
                Vec3 eye = player.getEyePosition();
                AABB b = entity.getBoundingBox();
                double x = Math.max(b.minX, Math.min(eye.x, b.maxX)), y = Math.max(b.minY, Math.min(eye.y, b.maxY)), z = Math.max(b.minZ, Math.min(eye.z, b.maxZ));
                lastReach = eye.distanceTo(new Vec3(x, y, z));
                long now = System.currentTimeMillis();
                combo = now - lastHitAt < 2500 ? combo + 1 : 1;
                lastHitAt = now;
            }
            return InteractionResult.PASS;
        });
    }

    /** Called every frame while the HUD draws. */
    public static void frame(Minecraft mc) {
        long now = System.currentTimeMillis();
        long win = GLFW.glfwGetCurrentContext();
        boolean l = mc.screen == null && win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean r = mc.screen == null && win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        if (l && !wasL) left.addLast(now);
        if (r && !wasR) right.addLast(now);
        wasL = l; wasR = r;
        while (!left.isEmpty() && now - left.peekFirst() > 1000) left.pollFirst();
        while (!right.isEmpty() && now - right.peekFirst() > 1000) right.pollFirst();
        if (mc.player != null) {
            int hurt = mc.player.hurtTime;
            if (hurt > lastHurt) combo = 0; // you got hit: combo over
            lastHurt = hurt;
        }
        if (now - lastHitAt > 2500) combo = 0;
    }

    public static int leftCps() { return left.size(); }
    public static int rightCps() { return right.size(); }
}
