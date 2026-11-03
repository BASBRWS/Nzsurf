package nl.nzsurf.apkupdater;

import androidx.core.content.FileProvider;

/** Eigen subklasse: de app heeft al een FileProvider (Capacitor); twee met dezelfde naam botsen. */
public class UpdateFileProvider extends FileProvider { }
