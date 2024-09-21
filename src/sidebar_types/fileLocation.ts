export default class FileLocation {
  constructor(
    public readonly filePath: string,
    public readonly startLine: number,
    public readonly endLine: number
  ) {}
}
