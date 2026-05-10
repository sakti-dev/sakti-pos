package com.sakti_dev.sakti_pos.printer

import android.annotation.SuppressLint
import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import com.dantsu.escposprinter.EscPosPrinter
import com.dantsu.escposprinter.connection.DeviceConnection
import com.dantsu.escposprinter.exceptions.EscPosConnectionException
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@InvokeArg
class PrintReceiptArgs {
    lateinit var address: String
    lateinit var formattedText: String
}

@InvokeArg
class TestPrintArgs {
    lateinit var address: String
}

data class PrinterInfo(
    val address: String,
    val name: String,
)

private const val LOG_TAG = "SaktiPrinter"
private const val BLUETOOTH_CONNECT_TIMEOUT_MS = 2_500L
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")
private const val PRINTER_OFFLINE_MESSAGE =
    "Printer tidak tersambung. Pastikan printer menyala dan berada dalam jangkauan."

private class TimedBluetoothConnection(
    private val device: BluetoothDevice,
    private val adapter: BluetoothAdapter,
    private val connectTimeoutMs: Long,
) : DeviceConnection() {
    private var socket: BluetoothSocket? = null

    override fun isConnected(): Boolean {
        return socket?.isConnected == true && super.isConnected()
    }

    @SuppressLint("MissingPermission")
    override fun connect(): DeviceConnection {
        if (isConnected) {
            return this
        }

        val nextSocket = device.createRfcommSocketToServiceRecord(getDeviceUuid())
        socket = nextSocket
        adapter.cancelDiscovery()

        var failure: Throwable? = null
        val connectThread = Thread {
            try {
                nextSocket.connect()
            } catch (error: Throwable) {
                failure = error
            }
        }

        connectThread.start()
        connectThread.join(connectTimeoutMs)

        if (connectThread.isAlive) {
            closeSocket(nextSocket)
            connectThread.join(250)
            socket = null
            throw EscPosConnectionException(PRINTER_OFFLINE_MESSAGE)
        }

        if (failure != null) {
            disconnect()
            throw EscPosConnectionException("Unable to connect to bluetooth device.")
        }

        outputStream = nextSocket.outputStream
        data = ByteArray(0)
        return this
    }

    override fun disconnect(): DeviceConnection {
        data = ByteArray(0)
        outputStream?.closeQuietly()
        outputStream = null
        socket?.let { closeSocket(it) }
        socket = null
        return this
    }

    private fun getDeviceUuid(): UUID {
        val uuids = device.uuids
        if (uuids != null && uuids.isNotEmpty()) {
            if (uuids.contains(ParcelUuid(SPP_UUID))) {
                return SPP_UUID
            }
            return uuids[0].uuid
        }
        return SPP_UUID
    }

    private fun closeSocket(socket: BluetoothSocket) {
        try {
            socket.close()
        } catch (error: IOException) {
            Log.w(LOG_TAG, "Failed to close bluetooth socket", error)
        }
    }

    private fun java.io.OutputStream.closeQuietly() {
        try {
            close()
        } catch (error: IOException) {
            Log.w(LOG_TAG, "Failed to close bluetooth output stream", error)
        }
    }
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.BLUETOOTH_CONNECT],
            alias = "bluetoothConnect",
        ),
        Permission(
            strings = [Manifest.permission.BLUETOOTH_SCAN],
            alias = "bluetoothScan",
        ),
    ],
)
class ThermalPrinterPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun requestBluetoothPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            invoke.resolve()
            return
        }
        requestPermissionForAliases(
            arrayOf("bluetoothConnect", "bluetoothScan"),
            invoke,
            "onBluetoothPermissionRequested",
        )
    }

    @PermissionCallback
    fun onBluetoothPermissionRequested(invoke: Invoke) {
        invoke.resolve()
    }

    @Command
    fun checkBluetoothPermission(invoke: Invoke) {
        invoke.resolveObject(
            mapOf(
                "bluetoothConnect" to hasBluetoothConnectPermission(),
                "bluetoothScan" to hasBluetoothScanPermission(),
            ),
        )
    }

    @Command
    fun listPrinters(invoke: Invoke) {
        if (!hasBluetoothPrintPermissions()) {
            Log.w(LOG_TAG, "listPrinters rejected: missing bluetooth permissions")
            invoke.reject("Bluetooth connect and scan permissions are required to list paired printers")
            return
        }

        val bluetoothAdapter = activity.getSystemService(BluetoothManager::class.java).adapter
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.w(LOG_TAG, "listPrinters rejected: bluetooth unavailable or disabled")
            invoke.reject("Bluetooth is not available or not enabled")
            return
        }

        try {
            val printers = bluetoothAdapter.bondedDevices
                .mapNotNull { device ->
                    val address = device.address ?: return@mapNotNull null
                    PrinterInfo(
                        address = address,
                        name = device.name ?: "Unknown printer",
                    )
                }
                .sortedBy { printer -> printer.name.lowercase() }

            invoke.resolveObject(printers)
        } catch (error: SecurityException) {
            Log.e(LOG_TAG, "listPrinters failed", error)
            invoke.reject("Bluetooth permission is required to list paired printers")
        }
    }

    @Command
    fun printReceipt(invoke: Invoke) {
        val args = invoke.parseArgs(PrintReceiptArgs::class.java)

        if (!hasBluetoothPrintPermissions()) {
            Log.w(LOG_TAG, "printReceipt rejected: missing bluetooth permissions")
            invoke.reject("Bluetooth connect and scan permissions are required to print")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            var printer: EscPosPrinter? = null
            try {
                val connection = findPrinterConnection(args.address)

                if (connection == null) {
                    Log.w(LOG_TAG, "printReceipt rejected: printer not paired address=${args.address}")
                    invoke.reject("Printer is not paired or not available")
                    return@launch
                }

                printer = EscPosPrinter(connection, 203, 48f, 32)
                printer.printFormattedTextAndCut(args.formattedText)
                invoke.resolve()
            } catch (error: EscPosConnectionException) {
                Log.w(LOG_TAG, "printReceipt connection failed address=${args.address}: ${error.message}")
                invoke.reject(PRINTER_OFFLINE_MESSAGE)
            } catch (error: Exception) {
                Log.e(LOG_TAG, "printReceipt failed address=${args.address}", error)
                invoke.reject(error.message ?: "Failed to print receipt")
            } finally {
                printer?.disconnectPrinter()
            }
        }
    }

    @Command
    fun testPrint(invoke: Invoke) {
        val args = invoke.parseArgs(TestPrintArgs::class.java)

        if (!hasBluetoothPrintPermissions()) {
            Log.w(LOG_TAG, "testPrint rejected: missing bluetooth permissions")
            invoke.reject("Bluetooth connect and scan permissions are required to print")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            var printer: EscPosPrinter? = null
            try {
                val connection = findPrinterConnection(args.address)

                if (connection == null) {
                    Log.w(LOG_TAG, "testPrint rejected: printer not paired address=${args.address}")
                    invoke.reject("Printer is not paired or not available")
                    return@launch
                }

                val testText = "[C]<b>SAKTI POS</b>\n[C]Test Print\n[C]--------------------------------\n[L]Printer connected.\n[L]\n[L]\n"
                printer = EscPosPrinter(connection, 203, 48f, 32)
                printer.printFormattedTextAndCut(testText)
                invoke.resolve()
            } catch (error: EscPosConnectionException) {
                Log.w(LOG_TAG, "testPrint connection failed address=${args.address}: ${error.message}")
                invoke.reject(PRINTER_OFFLINE_MESSAGE)
            } catch (error: Exception) {
                Log.e(LOG_TAG, "testPrint failed address=${args.address}", error)
                invoke.reject(error.message ?: "Failed to print test page")
            } finally {
                printer?.disconnectPrinter()
            }
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun hasBluetoothScanPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun hasBluetoothPrintPermissions(): Boolean {
        return hasBluetoothConnectPermission() && hasBluetoothScanPermission()
    }

    private fun findPrinterConnection(address: String): DeviceConnection? {
        val bluetoothAdapter = activity.getSystemService(BluetoothManager::class.java).adapter
            ?: return null

        val device = bluetoothAdapter.bondedDevices
            .firstOrNull { it.address == address }
            ?: return null

        return TimedBluetoothConnection(device, bluetoothAdapter, BLUETOOTH_CONNECT_TIMEOUT_MS)
    }
}
