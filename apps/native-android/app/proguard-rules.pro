# Sovereign Portal C-137 — ProGuard / R8 rules
# Minification is disabled for the release build, but the keep rules are retained so
# enabling R8 later does not break the JavaScript bridge surface.

# Keep every @JavascriptInterface-annotated method reachable from the WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the native bridge classes and their public entry points.
-keep class com.rickc137.portal.MainActivity { *; }
-keep class com.rickc137.portal.security.HardenedBridge { *; }
-keep class com.rickc137.portal.sovereign.B2dTargetAgent { *; }

# OMAPI (eUICC / SGP.22) — accessed reflectively only on API 28+ devices.
-dontwarn android.se.omapi.**

# Keep line numbers for readable stack traces in the sovereign telemetry ledger.
-keepattributes SourceFile,LineNumberTable,RuntimeVisibleAnnotations,AnnotationDefault

# Preserve the Kotlin metadata used by reflection.
-keep class kotlin.Metadata { *; }

# Suppress notes about missing optional references.
-dontnote android.webkit.**
