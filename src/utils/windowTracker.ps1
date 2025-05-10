# Define the log file path
$trackingStartTime = Get-Date (Get-Date).ToUniversalTime() -UFormat %s
$logFile = "$env:USERPROFILE\focused_window_log_$trackingStartTime.json"

# Add required user32.dll functions
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class User32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError=true)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
}
"@

Write-Host "Starting window focus logger (only on change). Press Ctrl+C to stop."

# Initialize previous title
$previousTitle = ""

while ($true) {
    # Get the handle of the foreground window
    $handle = [User32]::GetForegroundWindow()

    # Allocate a buffer for the window title
    $title = New-Object System.Text.StringBuilder 256

    # Get the window title
    [User32]::GetWindowText($handle, $title, $title.Capacity) | Out-Null
    $currentTitle = $title.ToString()

    # Only log if the title has changed
    if ($currentTitle -ne $previousTitle -and $currentTitle.Trim() -ne "") {
        $timestamp = Get-Date (Get-Date).ToUniversalTime() -UFormat %s
        "$timestamp - $currentTitle" | Out-File -FilePath $logFile -Append
        Write-Host "$timestamp - $currentTitle"
        $previousTitle = $currentTitle
    }

    Start-Sleep -Seconds 1
}
