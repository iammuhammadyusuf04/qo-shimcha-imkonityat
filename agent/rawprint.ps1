param([string]$Printer, [Parameter(Mandatory=$true)][string]$File)
# Windows printeriga xom baytlarni yuboradi (winspool RAW)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
}
"@
if (-not $Printer) { $Printer = (Get-CimInstance Win32_Printer | Where-Object Default).Name }
if (-not $Printer) { Write-Error "Printer topilmadi"; exit 2 }
$bytes = [IO.File]::ReadAllBytes($File)
$h = [IntPtr]::Zero
if (-not [RawPrn]::OpenPrinter($Printer, [ref]$h, [IntPtr]::Zero)) { Write-Error "OpenPrinter xato: $Printer"; exit 3 }
$di = New-Object RawPrn+DOCINFO; $di.pDocName = "Etiketka"; $di.pDataType = "RAW"
$ok = [RawPrn]::StartDocPrinter($h, 1, $di) -and [RawPrn]::StartPagePrinter($h)
$w = 0
if ($ok) { $ok = [RawPrn]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) }
[void][RawPrn]::EndPagePrinter($h); [void][RawPrn]::EndDocPrinter($h); [void][RawPrn]::ClosePrinter($h)
if (-not $ok) { Write-Error "Yozishda xato"; exit 4 }
