-- Desktop shots recorded before cards had their own image cannot meet the next migration's check.
-- They are deleted, so those mods show no Desktop preview until `bun run render:mods` re-records them.
DELETE FROM "mod_desktop_previews" WHERE "kind" = 'shot';
