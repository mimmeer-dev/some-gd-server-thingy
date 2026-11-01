import process from "node:process"
import fs from "node:fs"
import { decodeB64Web } from "./base64web.js"

const baseURL = "https://geometrydashfiles.b-cdn.net/news/"

const newsVersion = await getNewsVersion()

const images = [] // images to grab later

if (newsVersion==-3) {
    console.log("Error: Are you connected to the internet?")
    process.exit(1)
} else if (newsVersion<0) {
    process.exit(1)
}

console.log(`Fetching News v${newsVersion}...`)

const file = await fetchNewsFile()
if (typeof file != "string") {
    if (file==-3) {
        console.log("Error: Are you connected to the internet?")
        process.exit(1)
    } else if (file<0) {
        process.exit(1)
    }
}

console.log("Parsing news...")

const content = await decodeNewsFile(file)
const partialArray = content.split('|')
let list = []
let header = {}
let i = 0
for (let item of partialArray) {
    let tmp = item.split(';')
    if (item.split(';').length<2) {
        let data2 = item.split(',')
        header.version = data2[0]
        header.articles = data2[1]
        continue
    }
    let article = {}
    for (let pairStr of tmp) {
        let pair = pairStr.split(':')
        let keyIdx = pair[0]
        let key
        let value
        switch (keyIdx) {
            case '1':
                key="entryId"
                value=parseInt(pair[1])
                break
            case '2':
                key="date"
                value=atob(pair[1])
                break
            case '3':
                key="newsTitle"
                value=atob(pair[1])
                break
            case '4':
                key="elements"
                value=decodeElements(pair[1], i)
                break
            default:
                key=keyIdx
                value=pair[1]
        }
        article[key] = value
    }
    list.push(article)
    i++;
}
console.log(`News Parsed! ${header.articles} articles found.`)

header.imgCount = images.length

fs.rmSync("./output/", {
    recursive: true
})
fs.mkdirSync("./output/")
let resultFile = fs.createWriteStream("./output/result.json", "utf-8");
resultFile.write(JSON.stringify(list))

console.log("Generating overview...")

let about = {
    "header": header
}

let titles = []

for (let article of list) {
    titles.push(article.newsTitle)
}

about.titles = titles

let aboutFile = fs.createWriteStream("./output/basics.json", "utf-8");
aboutFile.write(JSON.stringify(about))

console.log(`Downloading ${header.imgCount} images...`)
i=0
for (let image of images) {
    let imageData = await fetchImgFile(image.originalPath)
    if (typeof imageData == "number") {
        console.log(`Download Error for image ${image.originalPath}!`)
        console.log("Skipped download")
        images[i].downloadSucceeded=false
        i++
        continue
    }
    images[i].downloadSucceeded=true
    let imageFile = fs.createWriteStream("./output/"+image.filePath, "binary");
    imageFile.write(await imageData.bytes())
    i++
}

let imagesFile = fs.createWriteStream("./output/images.json", "utf-8");
imagesFile.write(JSON.stringify(images))

async function getNewsVersion() {
    let verFile
    try {
        verFile = await fetch(baseURL+"news_version.txt")
    }
    catch {
        console.log("Fetch error")
        return -3
    }
    if (!verFile.ok) {
        console.log(`Error: Connection Failed (${verFile.status} - ${verFile.statusText})`)
        return -1
    }
    let content = await verFile.text()
    if (typeof content != "string") {
        console.log(`Error: Content is not a string. (${content})`)
        return -2
    }
    try {
        let result = parseInt(content)
        if (isNaN(result)) {
            throw Error("Error: Is NaN")
        }
        return result
    } catch {
        console.log(`Error: Is not a number (${content})`)
        return -2
    }
}

async function fetchNewsFile() {
    let newsFile
    try {
        newsFile = await fetch(baseURL+"news.dat")
    }
    catch {
        console.log("Fetch error")
        return -3
    }
    if (!newsFile.ok) {
        console.log(`Error: Connection Failed (${newsFile.status} - ${newsFile.statusText})`)
        return -1
    }
    let content = await newsFile.text()
    if (typeof content != "string") {
        console.log(`Error: Content is not a string. (${content})`)
        return -2
    }
    return content
}

async function fetchImgFile(filePath) {
    let imgFile
    try {
        imgFile = await fetch(filePath)
    }
    catch {
        console.log("Fetch error")
        return -3
    }
    if (!imgFile.ok) {
        console.log(`Error: Connection Failed (${imgFile.status} - ${imgFile.statusText})`)
        return -1
    }
    let content = await imgFile.blob()
    return content
}

async function decodeNewsFile(file) {
    let decodedData = decodeB64Web(file)
    let decompress = new DecompressionStream("gzip")
    const data = Uint8Array.fromBase64(decodedData)
    const writer = decompress.writable.getWriter()
    await writer.write(data)
    await writer.close()
    const reader = decompress.readable.getReader();
    let done = false;
    let output = [];
    while (!done) {
        const result = await reader.read();
        if (result.value) {
            output.push(...result.value);
        }
        done = result.done;
    }
    return new TextDecoder().decode(new Uint8Array(output))
}

function decodeElements(value,index) {
    let elementsRaw = value.split('~')
    let elements = []
    for (let elementRaw of elementsRaw) {
        let values = elementRaw.split(',')
        let elementData = {}
        let type
        switch (values[0]) {
            case '0':
                type="string"
                break
            case '1':
                type="image"
                break
            case '2':
                type="string"
                break
            default:
                type="string"
                break
        }
        if (values[0]=='0') {
            elementData.content = atob(values[1])
            elementData.hasUrl = false
        } else if (values[0]=='1') {
            let originalPath = baseURL+values[1]
            let fileName = originalPath.split('.')
            let fileEx = fileName[fileName.length-1]
            let imgFilename = crypto.randomUUID()
            elementData.filename = imgFilename+"."+fileEx
            let imgdata = {
                "articleIdx": index,
                "originalPath": originalPath,
                "filePath": elementData.filename
            }
            images.push(imgdata)
            elementData.width = parseInt(values[2])
            elementData.height = parseInt(values[3])
            elementData.youTube = values[4]=="1" ? true : false
            if (values[5]==='') {
                elementData.hasUrl = false
            } else {
                elementData.hasUrl = true
                elementData.url = atob(decodeB64Web(values[5]))
            }
        } else if (values[0]=='2') {
            elementData.content = atob(values[1])
            elementData.hasUrl = true
            elementData.url = atob(values[2])
        }
        elementData.type = type
        elements.push(elementData)
    }
    return elements
}