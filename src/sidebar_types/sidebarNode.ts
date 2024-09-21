import FileLocation from "./fileLocation";

export default interface SidebarNode {
  displayName: string;
  metricValue: number;
  fileLocation: FileLocation;
}
