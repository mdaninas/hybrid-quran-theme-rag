[CmdletBinding()]
param(
    [string]$EnvFile,
    [string]$HttpUri = "http://localhost:7474",
    [string]$Database = "neo4j",
    [ValidateRange(1, 2000)]
    [int]$BatchSize = 500,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $PSScriptRoot "..\.env"
}

function Read-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "File environment tidak ditemukan: $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            $values[$key] = $value
        }
    }
    return $values
}

function Invoke-Neo4jStatement {
    param(
        [Parameter(Mandatory = $true)][string]$Statement,
        [hashtable]$Parameters = @{}
    )

    $payload = @{
        statements = @(
            @{
                statement = $Statement
                parameters = $Parameters
            }
        )
    } | ConvertTo-Json -Depth 30 -Compress

    $response = Invoke-RestMethod `
        -Method Post `
        -Uri $script:TransactionEndpoint `
        -Headers $script:Headers `
        -ContentType "application/json; charset=utf-8" `
        -Body $payload

    if ($response.errors.Count -gt 0) {
        $messages = @($response.errors | ForEach-Object { "[$($_.code)] $($_.message)" })
        throw ($messages -join [Environment]::NewLine)
    }

    return @($response.results[0].data)
}

function Send-Rows {
    param(
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][object[]]$Rows,
        [Parameter(Mandatory = $true)][string]$Statement
    )

    if ($Rows.Count -eq 0) {
        Write-Host ("{0}: tidak ada data." -f $Stage)
        return
    }

    for ($start = 0; $start -lt $Rows.Count; $start += $BatchSize) {
        $end = [Math]::Min($start + $BatchSize - 1, $Rows.Count - 1)
        if ($start -eq $end) {
            $batch = @($Rows[$start])
        }
        else {
            $batch = @($Rows[$start..$end])
        }

        $null = Invoke-Neo4jStatement -Statement $Statement -Parameters @{ rows = $batch }
        Write-Progress -Activity $Stage -Status ("{0}/{1}" -f ($end + 1), $Rows.Count) -PercentComplete ((($end + 1) / $Rows.Count) * 100)
    }

    Write-Progress -Activity $Stage -Completed
    Write-Host ("{0}: {1} baris diproses." -f $Stage, $Rows.Count)
}

function Test-AyatReference {
    param([object]$Value)

    if ($null -eq $Value -or $Value -isnot [System.Management.Automation.PSCustomObject]) {
        return $false
    }

    return ($null -ne $Value.PSObject.Properties['surah'] -and $null -ne $Value.PSObject.Properties['ayat'])
}

function Add-ThemeBranch {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowNull()][object]$Value,
        [AllowNull()][string]$Parent
    )

    if ([string]::IsNullOrWhiteSpace($Name)) {
        throw "Nama tema kosong ditemukan pada data tematik."
    }

    $script:ThemeNames[$Name] = [pscustomobject]@{ nama = $Name }

    if (-not [string]::IsNullOrWhiteSpace($Parent) -and $Parent -cne $Name) {
        $edgeKey = "{0}{1}{2}" -f $Parent, $script:KeySeparator, $Name
        $script:ThemeEdges[$edgeKey] = [pscustomobject]@{
            parent = $Parent
            child = $Name
        }
    }

    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        foreach ($property in $Value.PSObject.Properties) {
            Add-ThemeBranch -Name $property.Name -Value $property.Value -Parent $Name
        }
        return
    }

    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        foreach ($item in $Value) {
            if (Test-AyatReference -Value $item) {
                $ayatId = "{0}:{1}" -f $item.surah, $item.ayat
                $linkKey = "{0}{1}{2}" -f $Name, $script:KeySeparator, $ayatId
                $script:ThemeAyatLinks[$linkKey] = [pscustomobject]@{
                    tema = $Name
                    ayat_id = $ayatId
                }
            }
            elseif ($item -is [System.Management.Automation.PSCustomObject]) {
                foreach ($property in $item.PSObject.Properties) {
                    Add-ThemeBranch -Name $property.Name -Value $property.Value -Parent $Name
                }
            }
            elseif ($item -is [System.Collections.IEnumerable] -and $item -isnot [string]) {
                Add-ThemeBranch -Name $Name -Value $item -Parent $null
            }
            else {
                throw "Format tematik tidak dikenali di bawah tema '$Name'."
            }
        }
        return
    }

    if ($null -ne $Value) {
        throw "Format tematik tidak dikenali di bawah tema '$Name'."
    }
}

$envValues = Read-DotEnv -Path $EnvFile
$neo4jUser = $envValues['NEO4J_LOKAL_USER']
$neo4jPassword = $envValues['NEO4J_LOKAL_PASSWORD']

if ([string]::IsNullOrWhiteSpace($neo4jUser) -or [string]::IsNullOrWhiteSpace($neo4jPassword)) {
    throw "NEO4J_LOKAL_USER atau NEO4J_LOKAL_PASSWORD belum terisi di $EnvFile"
}

$credentialText = "{0}:{1}" -f $neo4jUser, $neo4jPassword
$basicToken = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credentialText))
$script:Headers = @{
    Authorization = "Basic $basicToken"
    Accept = "application/json"
}
$script:TransactionEndpoint = "{0}/db/{1}/tx/commit" -f $HttpUri.TrimEnd('/'), $Database

$readyDirectory = Join-Path $PSScriptRoot "READY"
$surahPath = Join-Path $readyDirectory "NODE_SURAH.json"
$ayatPath = Join-Path $readyDirectory "NODE_AYAT.json"
$artiPath = Join-Path $readyDirectory "NODE_ARTI_NAMA.json"
$tempatPath = Join-Path $readyDirectory "NODE_TEMPAT.json"
$tematikPath = Join-Path $PSScriptRoot "tematik_.json"
$sourceFiles = @($surahPath, $ayatPath, $artiPath, $tempatPath, $tematikPath)

foreach ($sourceFile in $sourceFiles) {
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Data sumber tidak ditemukan: $sourceFile"
    }
}

Write-Host "Membaca dan memvalidasi data sumber..."
$surahData = @((Get-Content -Raw -LiteralPath $surahPath -Encoding UTF8 | ConvertFrom-Json).GetEnumerator())
$ayatData = @((Get-Content -Raw -LiteralPath $ayatPath -Encoding UTF8 | ConvertFrom-Json).GetEnumerator())
$artiData = @((Get-Content -Raw -LiteralPath $artiPath -Encoding UTF8 | ConvertFrom-Json).GetEnumerator())
$tempatData = @((Get-Content -Raw -LiteralPath $tempatPath -Encoding UTF8 | ConvertFrom-Json).GetEnumerator())
$tematikData = Get-Content -Raw -LiteralPath $tematikPath -Encoding UTF8 | ConvertFrom-Json

$surahIds = @{}
foreach ($item in $surahData) {
    $id = [string]$item.id
    if ($surahIds.ContainsKey($id)) {
        throw "ID surah duplikat pada sumber: $id"
    }
    $surahIds[$id] = $true
}

$ayatIds = @{}
foreach ($item in $ayatData) {
    $id = [string]$item.'surah:ayat'
    if ($ayatIds.ContainsKey($id)) {
        throw "ID ayat duplikat pada sumber: $id"
    }
    if (-not $surahIds.ContainsKey([string]$item.id_surah)) {
        throw "Ayat $id merujuk surah yang tidak tersedia."
    }
    $ayatIds[$id] = $true
}

$script:KeySeparator = [char]31
$script:ThemeNames = @{}
$script:ThemeEdges = @{}
$script:ThemeAyatLinks = @{}
foreach ($root in $tematikData.PSObject.Properties) {
    Add-ThemeBranch -Name $root.Name -Value $root.Value -Parent $null
}

$themeRows = @($script:ThemeNames.Values)
$themeEdgeRows = @($script:ThemeEdges.Values)
$themeAyatRows = @($script:ThemeAyatLinks.Values)
$missingThemeAyatIds = @($themeAyatRows | Where-Object { -not $ayatIds.ContainsKey([string]$_.ayat_id) } | ForEach-Object { $_.ayat_id } | Sort-Object -Unique)

$surahRows = @($surahData | ForEach-Object {
    [pscustomobject]@{
        id = [string]$_.id
        nama_arab = [string]$_.name
        nama_latin = [string]$_.nama_latin
        total_ayat = [int]$_.total_ayat
    }
})
$ayatRows = @($ayatData | ForEach-Object {
    [pscustomobject]@{
        id = [string]$_.'surah:ayat'
        id_surah = [string]$_.id_surah
        ayat = [int]$_.ayat
        ayat_arab = [string]$_.ayat_arab
        ayat_indonesia = [string]$_.ayat_bahasa_indonesia
        ayat_inggris = [string]$_.ayat_bahasa_inggris
    }
})
$artiRows = @($artiData | ForEach-Object {
    [pscustomobject]@{
        id_surah = [string]$_.id_surah
        arti = [string]$_.arti_nama
    }
})
$tempatRows = @($tempatData | ForEach-Object {
    [pscustomobject]@{
        id_surah = [string]$_.id_surah
        lokasi = [string]$_.lokasi
    }
})

Write-Host ("Surah={0}; Ayat={1}; ArtiNama={2}; Tempat={3}" -f $surahRows.Count, $ayatRows.Count, $artiRows.Count, $tempatRows.Count)
Write-Host ("Tematik unik={0}; SUB_TEMA unik={1}; referensi tema-ayat unik={2}" -f $themeRows.Count, $themeEdgeRows.Count, $themeAyatRows.Count)
if ($missingThemeAyatIds.Count -gt 0) {
    Write-Warning ("{0} ID ayat pada data tematik tidak tersedia dan relasinya akan dilewati: {1}" -f $missingThemeAyatIds.Count, ($missingThemeAyatIds -join ', '))
}

$connectivity = @(Invoke-Neo4jStatement -Statement "RETURN 1 AS ok")
if ($connectivity.Count -ne 1 -or [int]$connectivity[0].row[0] -ne 1) {
    throw "Neo4j merespons, tetapi pemeriksaan koneksi tidak valid."
}
Write-Host ("Koneksi Neo4j berhasil: {0} (database: {1})" -f $HttpUri, $Database)

if ($ValidateOnly) {
    Write-Host "Validasi selesai. Tidak ada perubahan pada Neo4j."
    exit 0
}

$constraints = @(
    "CREATE CONSTRAINT surah_id_unique IF NOT EXISTS FOR (n:Surah) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT ayat_id_unique IF NOT EXISTS FOR (n:Ayat) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT arti_nama_unique IF NOT EXISTS FOR (n:ArtiNama) REQUIRE n.arti IS UNIQUE",
    "CREATE CONSTRAINT tempat_lokasi_unique IF NOT EXISTS FOR (n:Tempat) REQUIRE n.lokasi IS UNIQUE",
    "CREATE CONSTRAINT tematik_nama_unique IF NOT EXISTS FOR (n:Tematik) REQUIRE n.nama IS UNIQUE"
)
foreach ($constraint in $constraints) {
    $null = Invoke-Neo4jStatement -Statement $constraint
}
Write-Host "Constraint unik siap."

Send-Rows -Stage "Surah" -Rows $surahRows -Statement @'
UNWIND $rows AS row
MERGE (s:Surah {id: row.id})
SET s.nama_arab = row.nama_arab,
    s.nama_latin = row.nama_latin,
    s.total_ayat = row.total_ayat
'@

Send-Rows -Stage "Ayat dan MEMILIKI_AYAT" -Rows $ayatRows -Statement @'
UNWIND $rows AS row
MERGE (a:Ayat {id: row.id})
SET a.ayat = row.ayat,
    a.ayat_arab = row.ayat_arab,
    a.ayat_indonesia = row.ayat_indonesia,
    a.ayat_inggris = row.ayat_inggris
WITH row, a
MATCH (s:Surah {id: row.id_surah})
MERGE (s)-[:MEMILIKI_AYAT]->(a)
'@

Send-Rows -Stage "ArtiNama dan MEMILIKI_ARTI" -Rows $artiRows -Statement @'
UNWIND $rows AS row
MERGE (a:ArtiNama {arti: row.arti})
WITH row, a
MATCH (s:Surah {id: row.id_surah})
MERGE (s)-[:MEMILIKI_ARTI]->(a)
'@

Send-Rows -Stage "Tempat dan DITURUNKAN_DI" -Rows $tempatRows -Statement @'
UNWIND $rows AS row
MERGE (t:Tempat {lokasi: row.lokasi})
WITH row, t
MATCH (s:Surah {id: row.id_surah})
MERGE (s)-[:DITURUNKAN_DI]->(t)
'@

Send-Rows -Stage "Tematik" -Rows $themeRows -Statement @'
UNWIND $rows AS row
MERGE (:Tematik {nama: row.nama})
'@

Send-Rows -Stage "SUB_TEMA" -Rows $themeEdgeRows -Statement @'
UNWIND $rows AS row
MATCH (p:Tematik {nama: row.parent})
MATCH (c:Tematik {nama: row.child})
MERGE (p)-[:SUB_TEMA]->(c)
'@

Send-Rows -Stage "TERKAIT_AYAT" -Rows $themeAyatRows -Statement @'
UNWIND $rows AS row
MATCH (t:Tematik {nama: row.tema})
MATCH (a:Ayat {id: row.ayat_id})
MERGE (t)-[:TERKAIT_AYAT]->(a)
'@

$stats = @(Invoke-Neo4jStatement -Statement @'
MATCH (n)
UNWIND labels(n) AS label
RETURN 'node' AS kind, label AS name, count(*) AS total
UNION ALL
MATCH ()-[r]->()
RETURN 'relationship' AS kind, type(r) AS name, count(*) AS total
'@)

Write-Host ""
Write-Host "Ringkasan graph:"
foreach ($entry in $stats) {
    Write-Host ("{0,-12} {1,-20} {2}" -f $entry.row[0], $entry.row[1], $entry.row[2])
}
Write-Host "Ingest selesai. Script ini aman dijalankan ulang karena seluruh data memakai MERGE."
