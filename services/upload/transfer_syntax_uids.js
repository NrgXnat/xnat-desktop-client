const TransferSyntaxUIDs = [
    {"TransferSyntaxUID":"1.2.840.10008.1.2","label":"Implicit VR Endian: Default Transfer Syntax for DICOM","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.1","label":"Explicit VR Little Endian","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.1.99","label":"Deflated Explicit VR Little Endian","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.2","label":"Explicit VR Big Endian","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.50","label":"JPEG Baseline (Process 1):Default Transfer Syntax for Lossy JPEG 8-bit Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.51","label":"JPEG Baseline (Processes 2 & 4):Default Transfer Syntax for Lossy JPEG 12-bit Image Compression(Process 4 only)","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.52","label":"JPEG Extended (Processes 3 & 5)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.53","label":"JPEG Spectral Selection, Nonhierarchical (Processes 6 & 8)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.54","label":"JPEG Spectral Selection,  Nonhierarchical (Processes 7 & 9)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.55","label":"JPEG Full Progression, Nonhierarchical (Processes 10 & 12)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.56","label":"JPEG Full Progression, Nonhierarchical (Processes 11 & 13)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.57","label":"JPEG Lossless, Nonhierarchical (Processes 14)","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.58","label":"JPEG Lossless, Nonhierarchical (Processes 15)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.59","label":"JPEG Extended, Hierarchical (Processes 16  & 18)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.60","label":"JPEG Extended, Hierarchical (Processes 17  & 19)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.61","label":"JPEG Spectral Selection, Hierarchical (Processes 20 & 22)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.62","label":"JPEG Spectral Selection, Hierarchical (Processes 21 & 23)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.63","label":"JPEG Full Progression,  Hierarchical (Processes 24 & 26)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.64","label":"JPEG Full Progression,  Hierarchical (Processes 25 & 27)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.65","label":"JPEG Lossless, Nonhierarchical (Process  28)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.66","label":"JPEG Lossless, Nonhierarchical (Process  29)","retired":true},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.70","label":"JPEG Lossless, Nonhierarchical, First- Order Prediction(Processes 14 [Selection Value 1]): Default Transfer Syntax for Lossless JPEG Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.80","label":"JPEG-LS  Lossless  Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.81","label":"JPEG-LS  Lossy (Near- Lossless)  Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.90","label":"JPEG 2000 Image Compression (Lossless Only)","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.91","label":"JPEG 2000 Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.92","label":"JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.93","label":"JPEG 2000 Part 2 Multicomponent Image Compression","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.94","label":"JPIP Referenced","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.95","label":"JPIP Referenced Deflate","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.5","label":"RLE Lossless","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.6.1","label":"RFC 2557 MIME Encapsulation","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.100","label":"MPEG2 Main Profile Main Level","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.102","label":"MPEG-4 AVC/H.264 High Profile / Level 4.1","retired":false},
    {"TransferSyntaxUID":"1.2.840.10008.1.2.4.103","label":"MPEG-4 AVC/H.264 BD-compatible High Profile / Level 4.1","retired":false}
]

function findTransferSyntaxUID(TransferSyntaxUID) {
    const item = TransferSyntaxUIDs.find(item => {
        return item["TransferSyntaxUID"] === TransferSyntaxUID
    })

    return item ? item : {label: 'N/A'}
}

module.exports = {
    TransferSyntaxUIDs,
    findTransferSyntaxUID,
}