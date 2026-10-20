package net.vexclient.mod.online;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.vexclient.mod.VexClientMod;
import net.vexclient.mod.VexConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Which players use VEX, for the grey V badge. The launcher writes config/vex-online.json (your VEX online
 * address and session) before the game starts; every minute the mod tells VEX online "I'm playing with VEX"
 * and fetches the list of VEX players (Minecraft UUIDs only). Without that file the badge only shows on you.
 */
public final class VexOnline {
    private VexOnline() {}

    private static final Set<String> VEX = ConcurrentHashMap.newKeySet();
    private static volatile String url, token;
    private static volatile boolean started;

    private static String key(UUID id) { return id == null ? "" : id.toString().replace("-", "").toLowerCase(Locale.ROOT); }

    public static boolean isVex(UUID id) {
        if (id == null) return false;
        Minecraft mc = Minecraft.getInstance();
        if (mc.getUser() != null && id.equals(mc.getUser().getProfileId())) return true; // you always use VEX
        return VEX.contains(key(id));
    }

    /** The grey V logo as text, for in front of a name. */
    public static MutableComponent badge() {
        return Component.literal("V").withStyle(ChatFormatting.GRAY, ChatFormatting.BOLD);
    }

    public static Component badged(UUID id, Component name) {
        if (name == null || !VexConfig.get().vexBadges || !isVex(id)) return name;
        return Component.empty().append(badge()).append(Component.literal(" ").withStyle(ChatFormatting.RESET)).append(name);
    }

    public static synchronized void start() {
        if (started) return;
        started = true;
        try {
            Path f = FabricLoader.getInstance().getConfigDir().resolve("vex-online.json");
            if (Files.exists(f)) {
                JsonObject j = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
                String u = j.has("url") ? j.get("url").getAsString() : null;
                if (u != null && u.matches("https://[A-Za-z0-9.-]+(:\\d+)?(/[\\w./-]*)?") ) url = u.replaceAll("/+$", "");
                if (j.has("token")) token = j.get("token").getAsString();
            }
        } catch (Exception e) { VexClientMod.LOG.warn("Could not read vex-online.json", e); }
        if (url == null) return;
        Thread t = new Thread(VexOnline::loop, "VEX online");
        t.setDaemon(true);
        t.start();
    }

    private static void loop() {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        while (true) {
            try {
                if (token != null && token.matches("[A-Za-z0-9_-]{20,100}")) {
                    http.send(HttpRequest.newBuilder(URI.create(url + "/v1/mod/presence")).timeout(Duration.ofSeconds(15))
                            .header("authorization", "Bearer " + token).header("user-agent", "VEX-CLIENT-mod").POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.discarding());
                }
                HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(url + "/v1/public/vex-players")).timeout(Duration.ofSeconds(15))
                        .header("user-agent", "VEX-CLIENT-mod").GET().build(), HttpResponse.BodyHandlers.ofString());
                if (r.statusCode() == 200) {
                    JsonArray a = JsonParser.parseString(r.body()).getAsJsonObject().getAsJsonArray("uuids");
                    Set<String> next = ConcurrentHashMap.newKeySet();
                    for (var e : a) { String s = e.getAsString(); if (s.matches("[0-9a-f]{32}")) next.add(s); }
                    VEX.retainAll(next);
                    VEX.addAll(next);
                }
            } catch (Exception ignored) { /* offline: keep the last list */ }
            try { Thread.sleep(60_000); } catch (InterruptedException e) { return; }
        }
    }
}
