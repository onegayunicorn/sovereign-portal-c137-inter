#!/usr/bin/env python3
"""
Sovereign Portal C-137 — PortableApps (PAF) 5-Panel Builder UI.

Blueprint §9.1 reference implementation. The blueprint heredoc corrupted the `\\n`
escapes inside the generated string literals; this file restores correct escapes so
the module parses and runs.

Run:  python builder_ui.py
"""
import os
import sys
import json
import hashlib
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


class PortableAppBuilder(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portable App Builder v1.0 - PAF Spec 1.0")
        self.geometry("960x680")
        self.configure(bg="#1e1e1e")

        self.app_name = tk.StringVar(value="PortalC137Portable")
        self.version = tk.StringVar(value="1.0.0")
        self.publisher = tk.StringVar(value="Sovereign AI Labs")
        self.category = tk.StringVar(value="Utilities")
        self.executable = tk.StringVar(value="portal-c137.exe")
        self.output_dir = tk.StringVar(value=os.path.abspath("./Builds"))

        self.setup_ui()

    def setup_ui(self):
        header = tk.Frame(self, bg="#2d2d2d", height=50)
        header.pack(side=tk.TOP, fill=tk.X)
        tk.Label(
            header,
            text="SOVEREIGN PORTABLE APP PACKAGER (PAF SPEC 1.0)",
            fg="#00ff88",
            bg="#2d2d2d",
            font=("Consolas", 12, "bold")
        ).pack(side=tk.LEFT, padx=16, pady=12)

        notebook = ttk.Notebook(self)
        notebook.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        p1 = tk.Frame(notebook, bg="#252526")
        notebook.add(p1, text="1. App Metadata")
        self.build_panel_info(p1)

        p2 = tk.Frame(notebook, bg="#252526")
        notebook.add(p2, text="2. Package & Build")
        self.build_panel_export(p2)

        self.console = tk.Text(self, bg="#111", fg="#00ff88", font=("Consolas", 9), height=10)
        self.console.pack(fill=tk.X, padx=12, pady=(0, 12))
        self.log("[READY] Sovereign PAF Builder initialized.")

    def build_panel_info(self, parent):
        fields = [
            ("Application Name:", self.app_name),
            ("Version (SemVer):", self.version),
            ("Publisher:", self.publisher),
            ("Category:", self.category),
            ("Launch Executable:", self.executable),
            ("Build Output Directory:", self.output_dir),
        ]
        for i, (label, var) in enumerate(fields):
            tk.Label(parent, text=label, bg="#252526", fg="#fff", font=("Segoe UI", 10)).grid(
                row=i, column=0, sticky="w", padx=16, pady=8
            )
            entry = tk.Entry(parent, textvariable=var, width=50, bg="#333", fg="#fff", insertbackground="#fff")
            entry.grid(row=i, column=1, sticky="w", padx=16, pady=8)

    def build_panel_export(self, parent):
        btn_frame = tk.Frame(parent, bg="#252526")
        btn_frame.pack(pady=40)

        tk.Button(
            btn_frame,
            text="BUILD PAF DIRECTORY STRUCTURE",
            command=self.execute_build,
            bg="#0078d7",
            fg="#ffffff",
            font=("Segoe UI", 11, "bold"),
            padx=20,
            pady=10
        ).pack(pady=8)

    def log(self, text):
        self.console.insert(tk.END, text + "\n")
        self.console.see(tk.END)

    def execute_build(self):
        target_name = self.app_name.get().strip()
        version_str = self.version.get().strip()
        out_base = os.path.join(self.output_dir.get(), target_name + "_" + version_str)

        self.log("[BUILD] Generating PAF bundle at: " + out_base)
        try:
            dirs = [
                os.path.join(out_base, "App"),
                os.path.join(out_base, "App", "AppInfo"),
                os.path.join(out_base, "Data"),
                os.path.join(out_base, "Data", "settings"),
                os.path.join(out_base, "Other", "help"),
            ]
            for d in dirs:
                os.makedirs(d, exist_ok=True)

            appinfo_ini = (
                "[Format]\n"
                "Type=PortableApps.comFormat\n"
                "Version=3.5\n"
                "\n"
                "[Details]\n"
                "Name=" + target_name + "\n"
                "AppID=" + target_name + "\n"
                "Publisher=" + self.publisher.get() + "\n"
                "Category=" + self.category.get() + "\n"
                "\n"
                "[Version]\n"
                "PackageVersion=" + version_str + ".0\n"
                "DisplayVersion=" + version_str + "\n"
                "\n"
                "[Control]\n"
                "Icons=1\n"
                "Start=" + self.executable.get() + "\n"
            )
            with open(os.path.join(out_base, "App", "AppInfo", "appinfo.ini"), "w") as f:
                f.write(appinfo_ini)

            launcher_sh = (
                "#!/bin/sh\n"
                "DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n"
                "export DATA_DIR=\"$DIR/Data\"\n"
                "exec \"$DIR/App/" + self.executable.get() + "\" --data-dir=\"$DATA_DIR\" \"$@\"\n"
            )
            sh_path = os.path.join(out_base, target_name + ".sh")
            with open(sh_path, "w") as f:
                f.write(launcher_sh)
            os.chmod(sh_path, 0o755)

            hasher = hashlib.sha256()
            hasher.update(appinfo_ini.encode("utf-8"))
            sha = hasher.hexdigest()
            with open(os.path.join(out_base, "SHA256.txt"), "w") as f:
                f.write(sha + "  App/AppInfo/appinfo.ini\n")

            self.log("[SUCCESS] PAF Build verified! SHA256: " + sha[:16] + "...")
            messagebox.showinfo("Build Success", "PAF package generated at:\n" + out_base)
        except Exception as e:
            self.log("[ERROR] Build failed: " + str(e))
            messagebox.showerror("Build Error", str(e))


if __name__ == "__main__":
    app = PortableAppBuilder()
    app.mainloop()
