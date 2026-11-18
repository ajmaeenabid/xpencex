package com.xpence.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * The app's main screen. Google's permission screens (sign-in with email and profile, and linking
 * Google Drive and Sheets) report back here, and this passes their answer on to the SocialLogin plugin.
 * Without it, the plugin refuses any request that asks Google for permissions ("scopes").
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    // The longest the phone's start screen waits for the page, in case the page never reports in
    private static final long START_SCREEN_MAX_MS = 2500;
    private volatile boolean pageReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin for the home screen widget (src/features/widget/widget.ts)
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        keepStartScreenUntilPageReady();
    }

    /**
     * Android keeps its start screen (the logo on cream) until the app draws its first frame. Holding that
     * first frame back until the page has something on screen (its own logo, see index.html) means there is
     * never an empty screen in between: start screen, then the page's logo in the same spot, then the
     * opening animation. This is the way Android's splash screen guide recommends.
     */
    private void keepStartScreenUntilPageReady() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) { pageReady = true; }

            @Override
            public void onPageLoaded(WebView webView) { pageReady = true; }

            @Override
            public void onReceivedError(WebView webView) { pageReady = true; }
        });
        new Handler(Looper.getMainLooper()).postDelayed(() -> pageReady = true, START_SCREEN_MAX_MS);

        final View content = findViewById(android.R.id.content);
        content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                if (!pageReady) return false;
                content.getViewTreeObserver().removeOnPreDrawListener(this);
                return true;
            }
        });
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN || requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            return;
        }
        PluginHandle handle = getBridge().getPlugin("SocialLogin");
        if (handle == null) {
            Log.w("Xpences", "SocialLogin plugin is not loaded");
            return;
        }
        Plugin plugin = handle.getInstance();
        if (plugin instanceof SocialLoginPlugin) {
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // Tells the plugin this screen forwards Google's answers (required by the plugin)
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
