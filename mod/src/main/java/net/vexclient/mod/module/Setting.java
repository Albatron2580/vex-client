package net.vexclient.mod.module;

/** A single module option. Values are validated on load and on change. */
public abstract class Setting<T> {
    public final String id;
    public final String name;
    protected T value;
    protected final T def;

    protected Setting(String id, String name, T def) {
        this.id = id;
        this.name = name;
        this.def = def;
        this.value = def;
    }

    public T get() { return value; }
    public void set(T v) { value = validate(v); }
    public void reset() { value = def; }
    protected T validate(T v) { return v == null ? def : v; }
    /** Text shown on the setting's button. */
    public abstract String display();
    /** Called when the button is clicked (left = forward, right = back). */
    public abstract void cycle(boolean forward);
    public abstract Object toJson();
    public abstract void fromJson(Object o);

    public static final class Bool extends Setting<Boolean> {
        public Bool(String id, String name, boolean def) { super(id, name, def); }
        public String display() { return name + ": " + (value ? "ON" : "OFF"); }
        public void cycle(boolean f) { value = !value; }
        public Object toJson() { return value; }
        public void fromJson(Object o) { if (o instanceof Boolean b) value = b; }
    }

    public static final class Num extends Setting<Double> {
        public final double min, max, step;
        public final String unit;
        public Num(String id, String name, double def, double min, double max, double step, String unit) {
            super(id, name, def);
            this.min = min; this.max = max; this.step = step; this.unit = unit;
        }
        protected Double validate(Double v) { return v == null || v.isNaN() ? def : Math.max(min, Math.min(max, v)); }
        public String display() {
            String n = step >= 1 ? String.valueOf((long) Math.round(value)) : String.format("%.2f", value);
            return name + ": " + n + unit;
        }
        public void cycle(boolean f) {
            double n = value + (f ? step : -step);
            if (n > max + 1e-9) n = min;
            if (n < min - 1e-9) n = max;
            value = validate(Math.round(n / step) * step);
        }
        public Object toJson() { return value; }
        public void fromJson(Object o) { if (o instanceof Number n) set(n.doubleValue()); }
    }

    /** ARGB colour picked from a palette. */
    public static final class Color extends Setting<Integer> {
        public static final int[] PALETTE = {0xFFFFFFFF, 0xFFFF8A1F, 0xFFB46CFF, 0xFF4FD1FF, 0xFF5BFF7A, 0xFFFFE14F, 0xFFFF5B6E, 0xFFAAAAAA};
        public static final String[] NAMES = {"White", "Orange", "Purple", "Cyan", "Green", "Yellow", "Red", "Gray"};
        public Color(String id, String name, int def) { super(id, name, def); }
        private int index() { for (int i = 0; i < PALETTE.length; i++) if (PALETTE[i] == value) return i; return 0; }
        public String display() { return name + ": " + NAMES[index()]; }
        public void cycle(boolean f) { int i = index() + (f ? 1 : PALETTE.length - 1); value = PALETTE[i % PALETTE.length]; }
        public Object toJson() { return String.format("#%08X", value); }
        public void fromJson(Object o) {
            if (o instanceof String s && s.matches("#[0-9A-Fa-f]{8}")) value = (int) Long.parseLong(s.substring(1), 16);
        }
    }

    /** One of a fixed list of choices. */
    public static final class Choice extends Setting<String> {
        public final String[] options;
        public Choice(String id, String name, String def, String... options) { super(id, name, def); this.options = options; }
        protected String validate(String v) { for (String o : options) if (o.equals(v)) return v; return def; }
        public String display() { return name + ": " + value; }
        public void cycle(boolean f) {
            int i = 0;
            for (; i < options.length; i++) if (options[i].equals(value)) break;
            value = options[(i + (f ? 1 : options.length - 1)) % options.length];
        }
        public Object toJson() { return value; }
        public void fromJson(Object o) { if (o instanceof String s) set(s); }
    }
}
