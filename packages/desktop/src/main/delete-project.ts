export interface DeleteProjectResult {
  deleted: boolean;
  cloudError?: string;
}

/** 确认后先删云端：此时本地项目身份文件仍在。云端失败不阻止移入废纸篓。 */
export async function deleteProject(
  steps: { confirm(): Promise<boolean>; removeCloud?: () => Promise<unknown>; trash(): Promise<void> },
): Promise<DeleteProjectResult> {
  if (!(await steps.confirm())) return { deleted: false };
  let cloudError: string | undefined;
  try {
    await steps.removeCloud?.();
  } catch (error) {
    cloudError = error instanceof Error ? error.message : String(error);
  }
  await steps.trash();
  return { deleted: true, ...(cloudError !== undefined ? { cloudError } : {}) };
}
