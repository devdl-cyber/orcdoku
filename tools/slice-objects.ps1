# Snijdt een icoonblad met doorzichtige achtergrond in losse PNG's.
# Het zoekt elk los 'eiland' van zichtbare pixels, dus de icoontjes hoeven niet op een raster te staan.
# Losse streepjes (kleiner dan MinArea pixels) worden genegeerd.
#
# Gebruik:
#   pwsh tools/slice-objects.ps1 -Sheet assets/objects.webp -OutDir assets/objects -Names catapult,strobaal,...
# De namen gaan rij per rij, van links naar rechts.

param(
  [Parameter(Mandatory)] [string]   $Sheet,
  [Parameter(Mandatory)] [string]   $OutDir,
  [Parameter(Mandatory)] [string[]] $Names,
  [int] $AlphaMin = 160,
  [int] $MinArea = 1500,
  [int] $Near = 3,
  [int] $Pad = 4
)

if ($Names.Count -eq 1) { $Names = $Names[0].Split(",") }   # "a,b,c" als één tekst mag ook

Add-Type -AssemblyName PresentationCore
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Linq;
public static class Slicer3 {
  // 1. zoek alle 'eilanden' van zichtbare pixels (flood fill)
  // 2. voeg eilanden samen die elkaar (bijna) raken
  // 3. gooi kleine of dunne stukjes weg (losse streepjes)
  // 4. sorteer in rijen (op hoogte) en daarbinnen van links naar rechts
  public static List<int[]> Find(byte[] px, int w, int h, int alphaMin, int minArea, int near) {
    var seen = new bool[w * h];
    var boxes = new List<int[]>(); // x0,y0,x1,y1,area
    var stack = new Stack<int>();
    for (int i = 0; i < w * h; i++) {
      if (seen[i] || px[i * 4 + 3] < alphaMin) continue;
      int x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
      stack.Push(i); seen[i] = true;
      while (stack.Count > 0) {
        int p = stack.Pop(), x = p % w, y = p / w; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
          int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          int q = ny * w + nx; if (seen[q] || px[q * 4 + 3] < alphaMin) continue;
          seen[q] = true; stack.Push(q);
        }
      }
      boxes.Add(new[]{ x0, y0, x1, y1, area });
    }
    // eerst ruis weg, dan samenvoegen
    boxes = boxes.Where(b => b[4] >= 40).ToList();
    bool merged = true;
    while (merged) {
      merged = false;
      for (int a = 0; a < boxes.Count && !merged; a++) for (int b = a + 1; b < boxes.Count && !merged; b++) {
        var A = boxes[a]; var B = boxes[b];
        if (A[0] - near <= B[2] && B[0] - near <= A[2] && A[1] - near <= B[3] && B[1] - near <= A[3]) {
          boxes[a] = new[]{ Math.Min(A[0],B[0]), Math.Min(A[1],B[1]), Math.Max(A[2],B[2]), Math.Max(A[3],B[3]), A[4] + B[4] };
          boxes.RemoveAt(b); merged = true;
        }
      }
    }
    boxes = boxes.Where(b => b[4] >= minArea && b[2] - b[0] > 25 && b[3] - b[1] > 25).ToList();
    // rijen: sorteer op midden-y, nieuwe rij bij een sprong
    boxes = boxes.OrderBy(b => (b[1] + b[3]) / 2).ToList();
    var rows = new List<List<int[]>>();
    int lastY = -1000;
    foreach (var b in boxes) {
      int cy = (b[1] + b[3]) / 2;
      if (cy - lastY > 60) rows.Add(new List<int[]>());
      rows[rows.Count - 1].Add(b); lastY = cy;
    }
    return rows.SelectMany(r => r.OrderBy(b => b[0])).Select(b => new[]{ b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1 }).ToList();
  }
}
"@

$stream = [IO.File]::OpenRead((Resolve-Path $Sheet))
try {
  $frame = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stream, "None", "OnLoad").Frames[0]
} finally { $stream.Close() }
$src = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap($frame, [System.Windows.Media.PixelFormats]::Bgra32, $null, 0)
$w = $src.PixelWidth; $h = $src.PixelHeight
$px = New-Object byte[] ($w * $h * 4)
$src.CopyPixels($px, $w * 4, 0)

$boxes = [Slicer3]::Find($px, $w, $h, $AlphaMin, $MinArea, $Near)
if ($boxes.Count -ne $Names.Count) {
  Write-Warning "Gevonden: $($boxes.Count) iconen, maar $($Names.Count) namen opgegeven."
  $boxes | ForEach-Object { "  x=$($_[0]) y=$($_[1]) w=$($_[2]) h=$($_[3])" }
  exit 1
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
for ($i = 0; $i -lt $boxes.Count; $i++) {
  $b = $boxes[$i]
  $x = [Math]::Max(0, $b[0] - $Pad); $y = [Math]::Max(0, $b[1] - $Pad)
  $cw = [Math]::Min($w - $x, $b[2] + 2 * $Pad); $ch = [Math]::Min($h - $y, $b[3] + 2 * $Pad)
  $crop = New-Object System.Windows.Media.Imaging.CroppedBitmap($src, (New-Object System.Windows.Int32Rect($x, $y, $cw, $ch)))
  $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($crop))
  $file = Join-Path $OutDir "$($Names[$i]).png"
  $out = [IO.File]::Create($file); try { $enc.Save($out) } finally { $out.Close() }
  "{0,-12} {1,4},{2,4}  {3}x{4}" -f $Names[$i], $x, $y, $cw, $ch
}
