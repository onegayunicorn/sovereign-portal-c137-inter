// Root build script — Sovereign Portal C-137 native Android shell.
// Android Gradle Plugin 8.x + Kotlin. Plugin versions are only declared here and
// applied in :app so the whole project shares one toolchain.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
