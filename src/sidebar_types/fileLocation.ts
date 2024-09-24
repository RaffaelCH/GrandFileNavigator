export default class FileLocation {
  constructor(
    public readonly filePath: string, // TODO: Decide if we use absolute paths or relative paths (relative to workspace).
    public readonly startLine: number,
    public readonly endLine: number
  ) {}
}
