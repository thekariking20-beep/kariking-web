Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile('src\assets\kariking-logo.jpg')
$image.Save('assets\icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$image.Save('assets\splash.png', [System.Drawing.Imaging.ImageFormat]::Png)
$image.Dispose()
