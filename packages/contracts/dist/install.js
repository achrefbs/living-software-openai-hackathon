import { z } from "zod";
import { identifierSchema, isoDateTimeSchema, relativePathSchema, sha256Schema, } from "./primitives.js";
export const installedFileSchema = z
    .object({
    path: relativePathSchema,
    installedHash: sha256Schema,
})
    .strict();
export const installRecordSchema = z
    .object({
    schemaVersion: z.literal("living.install-record/v1"),
    installId: identifierSchema,
    installedAt: isoDateTimeSchema,
    appId: identifierSchema,
    adapter: z
        .object({
        id: identifierSchema,
        version: z.string().min(1).max(64),
    })
        .strict(),
    manifestHash: sha256Schema,
    mutationPolicy: z.literal("create-only"),
    files: z.array(installedFileSchema).min(1).max(64),
    preservedDataPaths: z.array(relativePathSchema).max(16),
})
    .strict()
    .superRefine((record, context) => {
    const paths = record.files.map((file) => file.path);
    if (new Set(paths).size !== paths.length) {
        context.addIssue({
            code: "custom",
            path: ["files"],
            message: "Installed file paths must be unique",
        });
    }
});
export function parseInstallRecord(input) {
    return installRecordSchema.parse(input);
}
//# sourceMappingURL=install.js.map