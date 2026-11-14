package com.xpence.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the app send the home screen widget its numbers and words (src/features/widget/widget.ts).
 * Everything is already formatted by the app, in its language; this only stores it and redraws the widget.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        SharedPreferences.Editor e = context.getSharedPreferences(XpencesWidget.PREFS, Context.MODE_PRIVATE).edit();
        for (String key : new String[] { "today", "month", "budget", "todayLabel", "monthLabel", "addLabel", "openLabel" }) {
            String value = call.getString(key);
            if (value != null) e.putString(key, value);
        }
        e.putInt("percent", call.getInt("percent", -1));
        e.putBoolean("hide", Boolean.TRUE.equals(call.getBoolean("hide", false)));
        e.apply();
        XpencesWidget.refreshAll(context);
        call.resolve(new JSObject());
    }

    /** Signing out: the widget forgets the numbers and shows "Open Xpences" */
    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(XpencesWidget.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        XpencesWidget.refreshAll(context);
        call.resolve(new JSObject());
    }
}
