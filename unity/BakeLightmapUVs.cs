using UnityEngine;
using UnityEditor;
using System.Collections.Generic;
using System.IO;

/// <summary>
/// Bakes Unity's lightmap scale/offset into mesh UV2 so any GLTF exporter
/// exports correct lightmap UVs without needing MX_lightmap extension.
///
/// Usage:
///   1. Bake lightmaps in Unity
///   2. Tools → Bake Lightmap UVs (saves _LM meshes to Assets/BakedLM/)
///   3. Export GLTF — the exporter will see the baked UV2
///   4. Tools → Restore Original Meshes (puts originals back, deletes _LM assets)
///
/// In Three.js: mat.lightMap = tex; // uses uv2, no scale/offset needed
/// </summary>
public class BakeLightmapUVs
{
    const string ASSET_FOLDER = "Assets/BakedLM";

    static Dictionary<MeshFilter, Mesh> originalMeshes = new Dictionary<MeshFilter, Mesh>();
    static Dictionary<MeshRenderer, Vector4> originalScaleOffsets = new Dictionary<MeshRenderer, Vector4>();

    [MenuItem("Tools/Bake Lightmap UVs into Meshes")]
    static void Bake()
    {
        if (originalMeshes.Count > 0)
            Restore();

        originalMeshes.Clear();
        originalScaleOffsets.Clear();

        // Create asset folder
        if (!AssetDatabase.IsValidFolder(ASSET_FOLDER))
        {
            AssetDatabase.CreateFolder("Assets", "BakedLM");
        }

        int count = 0;

        MeshRenderer[] renderers;
        if (Selection.gameObjects.Length > 0)
        {
            var list = new List<MeshRenderer>();
            foreach (var go in Selection.gameObjects)
                list.AddRange(go.GetComponentsInChildren<MeshRenderer>());
            renderers = list.ToArray();
        }
        else
        {
            renderers = Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None);
        }

        foreach (var renderer in renderers)
        {
            if (renderer.lightmapIndex < 0 || renderer.lightmapIndex == 65534)
                continue;

            var filter = renderer.GetComponent<MeshFilter>();
            if (!filter || !filter.sharedMesh) continue;

            var mesh = filter.sharedMesh;

            // Skip already baked meshes
            if (mesh.name.EndsWith("_LM")) continue;

            Vector2[] srcUVs = null;
            if (mesh.uv2 != null && mesh.uv2.Length > 0)
                srcUVs = mesh.uv2;
            else if (mesh.uv != null && mesh.uv.Length > 0)
                srcUVs = mesh.uv;
            else
                continue;

            // Save original
            originalMeshes[filter] = mesh;

            // Create baked copy
            var newMesh = Object.Instantiate(mesh);
            newMesh.name = mesh.name + "_LM";

            var so = renderer.lightmapScaleOffset;
            Debug.Log($"  {renderer.gameObject.name}: UV2 count={srcUVs.Length} first=({srcUVs[0].x:F4},{srcUVs[0].y:F4}) SO=({so.x:F4},{so.y:F4},{so.z:F4},{so.w:F4}) hasUV2={mesh.uv2 != null && mesh.uv2.Length > 0}");

            var bakedUVs = new Vector2[srcUVs.Length];
            for (int i = 0; i < srcUVs.Length; i++)
            {
                bakedUVs[i] = new Vector2(
                    srcUVs[i].x * so.x + so.z,
                    srcUVs[i].y * so.y + so.w
                );
            }
            newMesh.uv2 = bakedUVs;

            // Save as asset on disk so GLTF exporter can find it
            string assetPath = $"{ASSET_FOLDER}/{renderer.gameObject.name}_{count}_LM.asset";
            AssetDatabase.CreateAsset(newMesh, assetPath);

            // Assign saved asset to the filter
            filter.sharedMesh = AssetDatabase.LoadAssetAtPath<Mesh>(assetPath);

            // Save and reset lightmapScaleOffset so Unity doesn't double-transform
            originalScaleOffsets[renderer] = so;
            renderer.lightmapScaleOffset = new Vector4(1, 1, 0, 0);
            count++;

            Debug.Log($"Baked: {renderer.gameObject.name} → {assetPath} (lm#{renderer.lightmapIndex} s=({so.x:F3},{so.y:F3}) o=({so.z:F3},{so.w:F3}))");
        }

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();

        Debug.Log($"<b>Bake Lightmap UVs: {count} meshes → {ASSET_FOLDER}/</b>\nExport GLTF, then Tools → Restore Original Meshes.");

        if (count > 0)
            EditorUtility.DisplayDialog("Bake Lightmap UVs",
                $"{count} meshes baked to {ASSET_FOLDER}/\n\n1. Export GLTF now\n2. Tools → Restore Original Meshes",
                "OK");
    }

    [MenuItem("Tools/Restore Original Meshes")]
    static void Restore()
    {
        int count = 0;
        foreach (var kvp in originalMeshes)
        {
            if (kvp.Key != null && kvp.Value != null)
            {
                kvp.Key.sharedMesh = kvp.Value;
                count++;
            }
        }
        originalMeshes.Clear();

        // Restore lightmap scale/offsets
        foreach (var kvp in originalScaleOffsets)
        {
            if (kvp.Key != null)
                kvp.Key.lightmapScaleOffset = kvp.Value;
        }
        originalScaleOffsets.Clear();

        // Delete baked assets
        if (AssetDatabase.IsValidFolder(ASSET_FOLDER))
        {
            AssetDatabase.DeleteAsset(ASSET_FOLDER);
            Debug.Log($"Deleted {ASSET_FOLDER}/");
        }

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();

        Debug.Log($"<b>Restored {count} original meshes.</b>");
        EditorUtility.DisplayDialog("Restore Meshes",
            count > 0 ? $"{count} meshes restored." : "Nothing to restore.", "OK");
    }

    [MenuItem("Tools/Restore Original Meshes", true)]
    static bool CanRestore()
    {
        return originalMeshes.Count > 0;
    }
}
