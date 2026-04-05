import React, { useState } from 'react'
import {
  View,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native'

const SCREEN_WIDTH = Dimensions.get('window').width
const IMAGE_GAP = 2

interface ImageGridProps {
  urls: string[]
}

// --- Full-screen viewer shown when user taps an image ---

interface ImageViewerProps {
  urls: string[]
  initialIndex: number
  onClose: () => void
}

function ImageViewer({ urls, initialIndex, onClose }: ImageViewerProps) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.viewerOverlay}>
          {/* ScrollView allows swiping between images horizontally */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: initialIndex * SCREEN_WIDTH, y: 0 }}
          >
            {urls.map((uri, index) => (
              <TouchableWithoutFeedback
                key={index}
                onPress={onClose}
              >
                <View style={styles.viewerPage}>
                  <Image
                    source={{ uri }}
                    style={styles.viewerImage}
                    resizeMode="contain"
                  />
                </View>
              </TouchableWithoutFeedback>
            ))}
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

// --- Layout helpers (pure functions, no side effects) ---

function SingleImage({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <Image
        source={{ uri }}
        style={styles.singleImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  )
}

function TwoImages({ urls, onPress }: { urls: string[]; onPress: (i: number) => void }) {
  const cellWidth = (SCREEN_WIDTH - IMAGE_GAP) / 2

  return (
    <View style={styles.row}>
      {urls.map((uri, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => onPress(index)}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri }}
            style={[styles.twoImageCell, { width: cellWidth }]}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ))}
    </View>
  )
}

function ThreeImages({ urls, onPress }: { urls: string[]; onPress: (i: number) => void }) {
  const largeWidth = (SCREEN_WIDTH * 2) / 3 - IMAGE_GAP / 2
  const smallWidth = SCREEN_WIDTH / 3 - IMAGE_GAP / 2

  return (
    <View style={styles.row}>
      {/* Large left image */}
      <TouchableOpacity onPress={() => onPress(0)} activeOpacity={0.9}>
        <Image
          source={{ uri: urls[0] }}
          style={[styles.threeLeftImage, { width: largeWidth }]}
          resizeMode="cover"
        />
      </TouchableOpacity>

      {/* Two stacked on the right */}
      <View style={[styles.threeRightStack, { width: smallWidth }]}>
        {[1, 2].map((index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onPress(index)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: urls[index] }}
              style={[
                styles.threeRightCell,
                index === 1 && { marginBottom: IMAGE_GAP },
              ]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function FourImages({ urls, onPress }: { urls: string[]; onPress: (i: number) => void }) {
  const cellWidth = (SCREEN_WIDTH - IMAGE_GAP) / 2

  return (
    <View>
      {/* Top row: images 0 and 1 */}
      <View style={[styles.row, { marginBottom: IMAGE_GAP }]}>
        {[0, 1].map((index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onPress(index)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: urls[index] }}
              style={[styles.fourCell, { width: cellWidth }]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom row: images 2 and 3 */}
      <View style={styles.row}>
        {[2, 3].map((index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onPress(index)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: urls[index] }}
              style={[styles.fourCell, { width: cellWidth }]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// --- Main exported component ---

export function ImageGrid({ urls }: ImageGridProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (urls.length === 0) return null

  // Clamp to max 4 images as per spec
  const displayUrls = urls.slice(0, 4)
  const count = displayUrls.length

  const handleOpen = (index: number) => setViewerIndex(index)
  const handleClose = () => setViewerIndex(null)

  return (
    <View style={styles.container}>
      {count === 1 && (
        <SingleImage uri={displayUrls[0]} onPress={() => handleOpen(0)} />
      )}
      {count === 2 && (
        <TwoImages urls={displayUrls} onPress={handleOpen} />
      )}
      {count === 3 && (
        <ThreeImages urls={displayUrls} onPress={handleOpen} />
      )}
      {count === 4 && (
        <FourImages urls={displayUrls} onPress={handleOpen} />
      )}

      {viewerIndex !== null && (
        <ImageViewer
          urls={displayUrls}
          initialIndex={viewerIndex}
          onClose={handleClose}
        />
      )}
    </View>
  )
}

const CELL_HEIGHT = 200

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: IMAGE_GAP,
  },
  // Single image: full width, aspect preserved up to 400px max
  singleImage: {
    width: SCREEN_WIDTH,
    height: undefined,
    aspectRatio: 16 / 9,
    maxHeight: 400,
  },
  // Two side-by-side
  twoImageCell: {
    height: CELL_HEIGHT,
  },
  // Three-layout: large left
  threeLeftImage: {
    height: CELL_HEIGHT * 2 + IMAGE_GAP,
  },
  threeRightStack: {
    flexDirection: 'column',
  },
  threeRightCell: {
    width: '100%',
    height: CELL_HEIGHT,
  },
  // 2x2 grid
  fourCell: {
    height: CELL_HEIGHT,
  },
  // Full-screen viewer
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  viewerPage: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
})

export default ImageGrid
