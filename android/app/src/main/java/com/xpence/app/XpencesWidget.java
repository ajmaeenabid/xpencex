package com.xpence.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The home screen widget: today's spending, this month against the budget, and "+ Add".
 * The app sends the numbers and words (in the app's language) through WidgetBridgePlugin.
 * With "Hide amounts" on (Profile), the amounts show as dots and only "+ Add" works.
 */
public class XpencesWidget extends AppWidgetProvider {

    static final String PREFS = "xpences_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Redraws every Xpences widget on the home screen with the latest numbers */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, XpencesWidget.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_xpences);
        boolean hide = p.getBoolean("hide", false);
        boolean hasData = p.contains("today");

        views.setTextViewText(R.id.widget_today_label, p.getString("todayLabel", "Today"));
        views.setTextViewText(R.id.widget_month_label, p.getString("monthLabel", "This month"));
        views.setTextViewText(R.id.widget_add, p.getString("addLabel", "+ Add"));

        if (!hasData) {
            views.setTextViewText(R.id.widget_today, p.getString("openLabel", "Open Xpences"));
            views.setTextViewText(R.id.widget_month, "");
            views.setViewVisibility(R.id.widget_bar, View.GONE);
            views.setTextViewText(R.id.widget_budget, "");
        } else if (hide) {
            views.setTextViewText(R.id.widget_today, "••••");
            views.setTextViewText(R.id.widget_month, "••••");
            views.setViewVisibility(R.id.widget_bar, View.GONE);
            views.setTextViewText(R.id.widget_budget, "");
        } else {
            views.setTextViewText(R.id.widget_today, p.getString("today", ""));
            views.setTextViewText(R.id.widget_month, p.getString("month", ""));
            int percent = p.getInt("percent", -1);
            if (percent >= 0) {
                views.setViewVisibility(R.id.widget_bar, View.VISIBLE);
                views.setProgressBar(R.id.widget_bar, 100, Math.min(percent, 100), false);
            } else {
                views.setViewVisibility(R.id.widget_bar, View.GONE);
            }
            views.setTextViewText(R.id.widget_budget, p.getString("budget", ""));
        }

        // "+ Add" opens the app on Add expense; tapping elsewhere opens the app
        views.setOnClickPendingIntent(R.id.widget_add, open(context, "xpences://add", 1));
        views.setOnClickPendingIntent(R.id.widget_root, open(context, "xpences://home", 2));
        return views;
    }

    private static PendingIntent open(Context context, String link, int code) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(link));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
